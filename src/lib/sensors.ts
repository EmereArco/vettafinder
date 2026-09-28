import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import { angleDiff, smoothAngle, toDeg } from './geo';

/** Direzione della bussola (gradi, Nord geografico se disponibile), filtrata. */
export function useHeading(active: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number>(0);
  const last = useRef<number | null>(null);
  const shown = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      sub = await Location.watchHeadingAsync((h) => {
        const raw = h.trueHeading != null && h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        const prev = last.current;
        last.current = smoothAngle(prev, raw, 0.12);
        // zona morta: niente aggiornamenti per variazioni impercettibili (evita il tremolio)
        if (prev == null || Math.abs(angleDiff(last.current, shown.current ?? last.current)) > 0.15) {
          shown.current = last.current;
          setHeading(last.current);
        }
        setAccuracy(Math.round(h.accuracy));
      });
      if (cancelled) sub.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);

  return { heading, accuracy };
}

/**
 * Inclinazione della fotocamera posteriore rispetto all'orizzonte (gradi):
 * 0 = telefono verticale, positivo = inquadra verso l'alto.
 * Usa |beta| per essere indipendente dalle convenzioni di segno iOS/Android.
 */
export function useCameraPitch(active: boolean) {
  const [pitch, setPitch] = useState(0);
  const last = useRef(0);
  const shown = useRef(0);
  useEffect(() => {
    if (!active) return;
    DeviceMotion.setUpdateInterval(40);
    const sub = DeviceMotion.addListener((m) => {
      if (!m.rotation) return;
      const beta = Math.abs(toDeg(m.rotation.beta));
      const p = beta - 90;
      last.current = last.current * 0.88 + p * 0.12;
      if (Math.abs(last.current - shown.current) > 0.15) {
        shown.current = last.current;
        setPitch(last.current);
      }
    });
    return () => sub.remove();
  }, [active]);
  return pitch;
}
