import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';
import { angleDiff, norm360, toDeg } from './geo';

/**
 * Orientamento della fotocamera posteriore con fusione dei sensori (filtro complementare):
 *  - il giroscopio segue la rotazione istante per istante (niente ritardo, niente tremolio);
 *  - l'accelerometro corregge lentamente la verticale (inclinazione e rollio);
 *  - il magnetometro corregge lentamente la direzione rispetto al Nord.
 * Funziona con il telefono in verticale (dove la bussola classica "impazzisce").
 *
 * Convenzione assi (Android): x a destra, y verso l'alto dello schermo, z uscente dallo schermo.
 * La fotocamera posteriore guarda lungo -z.
 */

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export type Orientation = {
  azimuth: number | null; // gradi dal Nord geografico, direzione della fotocamera
  pitch: number; // gradi, 0 = orizzontale, + verso l'alto
  roll: number; // gradi di rotazione da applicare alla sovrapposizione
  magOk: boolean; // campo magnetico plausibile
};

const RATE_MS = 20; // 50 Hz
const K_GRAV = 0.02; // quanto l'accelerometro corregge la verticale a ogni campione
const K_MAG = 0.015; // quanto la bussola corregge la direzione a ogni campione
const PUBLISH_MS = 33; // ~30 aggiornamenti al secondo verso l'interfaccia

export function useOrientation(active: boolean): Orientation {
  const [out, setOut] = useState<Orientation>({ azimuth: null, pitch: 0, roll: 0, magOk: true });
  const s = useRef({
    acc: null as V3 | null,
    mag: null as V3 | null,
    up: null as V3 | null, // verticale stimata nel sistema del telefono
    az: null as number | null, // azimut magnetico stimato
    accSign: 0, // +1 o -1: convenzione di segno dell'accelerometro rilevata
    gyroSign: 1, // si inverte da solo se il giroscopio risulta "al contrario"
    corr: 0, // correlazione giroscopio/bussola per il test di segno
    corrN: 0,
    lastMagAz: null as number | null,
    gyroAccum: 0,
    lastT: 0,
    lastPub: 0,
    decl: 3, // declinazione magnetica (Piemonte ≈ +3°), aggiornata dal GPS se possibile
  });

  useEffect(() => {
    if (!active) return;
    const st = s.current;
    Accelerometer.setUpdateInterval(RATE_MS);
    Gyroscope.setUpdateInterval(RATE_MS);
    Magnetometer.setUpdateInterval(RATE_MS);

    const magAzimuth = (up: V3, m: V3): number | null => {
      const H = cross(m, up); // Est
      if (Math.hypot(...H) < 1e-6) return null;
      const E = norm(H);
      const N = norm(cross(up, E)); // Nord orizzontale
      const c: V3 = [0, 0, -1];
      if (Math.abs(dot(c, up)) > 0.94) return null; // fotocamera quasi verticale: azimut indefinito
      return norm360(toDeg(Math.atan2(dot(c, E), dot(c, N))));
    };

    const subA = Accelerometer.addListener(({ x, y, z }) => {
      let a: V3 = [x, y, z];
      if (st.accSign === 0) {
        // Rileva il segno: in AR il telefono è tenuto dritto (y verso l'alto) o a faccia in su.
        const dom = Math.abs(y) > Math.abs(z) ? y : z;
        st.accSign = dom >= 0 ? 1 : -1;
      }
      a = norm([a[0] * st.accSign, a[1] * st.accSign, a[2] * st.accSign]);
      st.acc = a;
      if (!st.up) st.up = a;
    });

    const subM = Magnetometer.addListener(({ x, y, z }) => {
      st.mag = [x, y, z];
    });

    const subG = Gyroscope.addListener(({ x, y, z }) => {
      const now = Date.now();
      const dt = st.lastT ? Math.min(0.1, Math.max(0, (now - st.lastT) / 1000)) : RATE_MS / 1000;
      st.lastT = now;
      if (!st.up || !st.acc) return;
      const w: V3 = [x * st.gyroSign, y * st.gyroSign, z * st.gyroSign];

      // 1) ruota la verticale stimata con il giroscopio: dv/dt = -ω × v
      const wxv = cross(w, st.up);
      let up: V3 = [st.up[0] - wxv[0] * dt, st.up[1] - wxv[1] * dt, st.up[2] - wxv[2] * dt];
      // 2) correggi lentamente con l'accelerometro (solo se non ci sono scossoni)
      up = norm([up[0] * (1 - K_GRAV) + st.acc[0] * K_GRAV, up[1] * (1 - K_GRAV) + st.acc[1] * K_GRAV, up[2] * (1 - K_GRAV) + st.acc[2] * K_GRAV]);
      st.up = up;

      // 3) azimut: integra la rotazione attorno alla verticale del mondo
      const yawDeg = -toDeg(dot(w, up)) * dt;
      if (st.az != null) st.az = norm360(st.az + yawDeg);
      st.gyroAccum += yawDeg;

      // 4) correggi con la bussola
      let magOk = true;
      if (st.mag) {
        const field = Math.hypot(...st.mag);
        magOk = field > 20 && field < 70; // µT: fuori da questo intervallo c'è un disturbo (metallo, magneti)
        const mAz = magAzimuth(up, st.mag);
        if (mAz != null) {
          if (st.az == null) st.az = mAz;
          else {
            const err = angleDiff(mAz, st.az);
            const k = Math.abs(err) > 25 ? 0.1 : magOk ? K_MAG : K_MAG / 5;
            st.az = norm360(st.az + err * k);
          }
          // test automatico del segno del giroscopio
          if (st.lastMagAz != null) {
            const dMag = angleDiff(mAz, st.lastMagAz);
            if (Math.abs(dMag) > 1.5 && Math.abs(st.gyroAccum) > 1.5) {
              st.corr += Math.sign(dMag) === Math.sign(st.gyroAccum) ? 1 : -1;
              st.corrN++;
              st.lastMagAz = mAz;
              st.gyroAccum = 0;
              if (st.corrN >= 12 && st.corr <= -6) {
                st.gyroSign *= -1;
                st.corr = 0;
                st.corrN = 0;
              }
            }
          } else {
            st.lastMagAz = mAz;
            st.gyroAccum = 0;
          }
        }
      }

      // 5) pubblica ~30 volte al secondo
      const t = Date.now();
      if (t - st.lastPub >= PUBLISH_MS) {
        st.lastPub = t;
        const c: V3 = [0, 0, -1];
        const pitch = toDeg(Math.asin(Math.max(-1, Math.min(1, dot(c, up)))));
        const roll = toDeg(Math.atan2(up[0], up[1]));
        setOut({ azimuth: st.az == null ? null : norm360(st.az + st.decl), pitch, roll, magOk });
      }
    });

    // Declinazione magnetica dalla bussola di sistema (Nord vero - Nord magnetico), se disponibile.
    let hsub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      hsub = await Location.watchHeadingAsync((h) => {
        if (h.trueHeading != null && h.trueHeading >= 0 && h.magHeading >= 0) {
          const d = angleDiff(h.trueHeading, h.magHeading);
          if (Math.abs(d) < 20) st.decl = d;
        }
      });
      if (cancelled) hsub.remove();
    })();

    return () => {
      cancelled = true;
      subA.remove();
      subM.remove();
      subG.remove();
      hsub?.remove();
      st.up = null;
      st.az = null;
      st.accSign = 0;
      st.lastT = 0;
    };
  }, [active]);

  return out;
}
