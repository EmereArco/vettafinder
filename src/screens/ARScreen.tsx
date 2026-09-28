import React, { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PeakInfo, useApp } from '../state/AppState';
import { angleDiff, cardinal, formatDistance, norm360, toDeg, toRad } from '../lib/geo';
import { BAND_LIMITS_KM, horizonAngle } from '../lib/terrain';
import { useOrientation } from '../lib/orientation';
import { Tier, tierOf, TIER_STYLE } from '../lib/tiers';
import TierBar from '../components/TierBar';
import { C } from '../theme';

const ROW_H = 30;

export default function ARScreen() {
  const {
    infos, horizon, horizonStatus, headingOffset, setHeadingOffset, arTarget, setArTarget, openPeak, viewpoint, gpsStatus,
    profile, tiersOn,
  } = useApp();
  const insets = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [vFov, setVFov] = useState(60); // campo visivo verticale (lato lungo) in gradi
  const ori = useOrientation(true);
  const heading = ori.azimuth;
  const pitch = ori.pitch;
  const roll = ori.roll;
  const [ridgesOn, setRidgesOn] = useState(true);

  const az = heading != null ? norm360(heading + headingOffset) : null;
  const f = size.h / 2 / Math.tan(toRad(vFov / 2)); // lunghezza focale in pixel
  const hFov = size.w > 0 ? 2 * toDeg(Math.atan(size.w / 2 / f)) : 30;
  // La sovrapposizione è un quadrato grande quanto la diagonale, ruotato col rollio del telefono:
  // così resta allineata alle montagne anche col telefono storto, senza angoli scoperti.
  const D = Math.ceil(Math.hypot(size.w, size.h));
  const cx = D / 2;
  const cy = D / 2;
  const topY = cy - size.h / 2; // bordo superiore dello schermo nel sistema della sovrapposizione
  const spanFov = size.w > 0 ? 2 * toDeg(Math.atan(D / 2 / f)) : 40; // campo coperto dalla sovrapposizione

  const project = (brg: number, angle: number) => {
    const dAz = angleDiff(brg, az ?? 0);
    const x = cx + f * Math.tan(toRad(dAz));
    const y = cy - f * Math.tan(toRad(angle - pitch));
    return { x, y, dAz };
  };

  // --- Disposizione stabile delle etichette ---
  // Le righe si calcolano una volta sola in "spazio angolare" (non dipendono da dove
  // punta il telefono), così i nomi non saltano da una riga all'altra muovendosi.
  const layout = useMemo(() => {
    if (size.w === 0) return [];
    const pxPerDeg = f * toRad(1);
    const cands = infos.filter(
      (i) =>
        i.dist > 100 &&
        i.dist < 200000 &&
        (i.visible === true || (i.visible === null && i.angle > -2 && i.dist < 120000)),
    );
    const tierById = new Map<string, Tier>();
    for (const c of cands) tierById.set(c.peak.id, tierOf(c, profile));
    const shown = cands.filter((c) => tiersOn[tierById.get(c.peak.id)!] || c.peak.id === arTarget?.id);
    // Priorità di spazio: prima il livello 1, poi il 2, poi il 3
    shown.sort((a, b) => tierById.get(a.peak.id)! - tierById.get(b.peak.id)! || importance(b) - importance(a));
    const cands2 = shown;
    if (arTarget) {
      const t = cands2.findIndex((c) => c.peak.id === arTarget.id);
      if (t > 0) cands2.unshift(cands2.splice(t, 1)[0]);
    }
    const rows: { brg: number; half: number }[][] = [];
    const out: { c: PeakInfo; row: number; w: number; tier: Tier }[] = [];
    for (const c of cands2.slice(0, 300)) {
      const tier = tierById.get(c.peak.id)!;
      const w = `${c.peak.name} ${c.peak.ele}`.length * TIER_STYLE[tier].fontSize * 0.56 + 16;
      const half = (w / 2 + 3) / pxPerDeg;
      let r = 0;
      while (r < 6 && (rows[r] ?? []).some((o) => Math.abs(angleDiff(o.brg, c.brg)) < o.half + half)) r++;
      if (r >= 6) continue;
      (rows[r] = rows[r] ?? []).push({ brg: c.brg, half });
      out.push({ c, row: r, w, tier });
    }
    return out;
  }, [infos, f, size.w, arTarget, profile, tiersOn]);

  // --- Posizione a schermo (ogni fotogramma, solo proiezione) ---
  const labels = useMemo(() => {
    if (az == null || size.w === 0) return [];
    const out: { c: PeakInfo; x: number; y: number; ly: number; w: number; tier: Tier }[] = [];
    for (const l of layout) {
      if (Math.abs(angleDiff(l.c.brg, az)) > spanFov / 2 + 4) continue;
      const { x, y } = project(l.c.brg, l.c.angle);
      out.push({ c: l.c, x, y, w: l.w, tier: l.tier, ly: Math.max(topY + insets.top + 70, y - 46 - l.row * ROW_H) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, az, pitch, size, vFov]);

  // --- Creste dal modello del terreno, a piani (dal più lontano al più vicino) ---
  const ridgePaths = useMemo(() => {
    if (!horizon || az == null || size.w === 0 || !ridgesOn) return [];
    const bands = [...BAND_LIMITS_KM].reverse();
    return bands.map((km, i) => {
      let d = '';
      let prevY = 0;
      for (let o = -spanFov / 2 - 1; o <= spanFov / 2 + 1; o += 0.5) {
        const a = norm360(az + o);
        const { x, y } = project(a, horizonAngle(horizon, a, km * 1000));
        // interrompi la linea dove la cresta vicina sparisce sotto quella lontana (salti bruschi)
        const jump = d && Math.abs(y - prevY) > size.h * 0.25;
        d += `${!d || jump ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        prevY = y;
      }
      return { key: km, d, far: i };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, az, pitch, size, vFov, ridgesOn]);

  // --- Calibrazione: trascina in orizzontale per allineare la bussola ---
  const st = useRef({ start: 0, hFov, w: size.w, offset: headingOffset, labels, h: 0, D: 0, roll: 0 });
  st.current.hFov = hFov;
  st.current.w = size.w;
  st.current.offset = headingOffset;
  st.current.labels = labels;
  Object.assign(st.current, { h: size.h, D, roll });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        st.current.start = st.current.offset;
      },
      onPanResponderMove: (_, g) => {
        const degPerPx = st.current.hFov / Math.max(1, st.current.w);
        setHeadingOffset(st.current.start - g.dx * degPerPx);
      },
      onPanResponderRelease: (e, g) => {
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          const { locationX, locationY } = e.nativeEvent;
          // porta il tocco nel sistema ruotato della sovrapposizione
          const { w, h, D, roll } = st.current;
          const r = toRad(-roll);
          const px = locationX - w / 2;
          const py = locationY - h / 2;
          const tx = px * Math.cos(r) - py * Math.sin(r) + D / 2;
          const ty = px * Math.sin(r) + py * Math.cos(r) + D / 2;
          const hit = st.current.labels.find(
            (l) => Math.abs(l.x - tx) < l.w / 2 + 4 && Math.abs(l.ly - ty) < ROW_H / 2 + 4,
          );
          if (hit) openPeak(hit.c.peak);
        }
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  if (!perm) return <View style={styles.center} />;
  if (!perm.granted) {
    return (
      <View style={[styles.center, { padding: 32 }]}>
        <Ionicons name="camera" size={48} color={C.accent} />
        <Text style={styles.permTitle}>Serve la fotocamera</Text>
        <Text style={styles.permText}>Per sovrapporre i nomi delle cime a ciò che inquadri.</Text>
        <Pressable style={styles.permBtn} onPress={requestPerm}>
          <Text style={styles.permBtnText}>Consenti</Text>
        </Pressable>
      </View>
    );
  }

  // Freccia verso la cima cercata se fuori inquadratura
  const targetInfo = arTarget ? infos.find((i) => i.peak.id === arTarget.id) : undefined;
  const targetDelta = targetInfo && az != null ? angleDiff(targetInfo.brg, az) : null;
  const targetOff = targetDelta != null && Math.abs(targetDelta) > hFov / 2;

  return (
    <View style={styles.flex} onLayout={onLayout}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} {...pan.panHandlers}>
        {size.w > 0 && az != null && (
          <Svg
            width={D}
            height={D}
            style={{
              position: 'absolute',
              left: (size.w - D) / 2,
              top: (size.h - D) / 2,
              transform: [{ rotate: `${roll.toFixed(2)}deg` }],
            }}
          >
            {ridgePaths.map((r) => (
              <Path
                key={r.key}
                d={r.d}
                stroke="#FFFFFF"
                strokeOpacity={0.35 + r.far * 0.15}
                strokeWidth={0.8 + r.far * 0.5}
                strokeDasharray={r.far === 0 ? '4 4' : undefined}
                fill="none"
              />
            ))}
            {labels.map(({ c, x, y, ly, w, tier }) => {
              const isTarget = arTarget?.id === c.peak.id;
              const ts = TIER_STYLE[tier];
              const color = isTarget ? C.accent2 : tier === 1 && c.peak.ele >= 4000 ? C.accent : ts.color;
              const hh = ts.fontSize + 9;
              return (
                <G key={c.peak.id} opacity={isTarget ? 1 : ts.opacity}>
                  <Line x1={x} y1={ly + hh / 2} x2={x} y2={y} stroke={color} strokeWidth={tier === 1 ? 1.4 : 1} strokeOpacity={0.85} />
                  <Circle cx={x} cy={y} r={tier === 1 ? 3.5 : 2.5} fill={color} />
                  <Rect x={x - w / 2} y={ly - hh / 2} width={w} height={hh} rx={hh / 2} fill={`rgba(14,22,32,${ts.bg})`} stroke={color} strokeWidth={isTarget ? 2 : 0} />
                  <SvgText x={x} y={ly + ts.fontSize / 3} fill={color} fontSize={ts.fontSize} fontWeight={ts.bold ? 'bold' : 'normal'} textAnchor="middle">
                    {`${c.peak.name} ${c.peak.ele}`}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        )}
      </View>

      {/* HUD superiore */}
      <View style={[styles.hud, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.hudBox}>
          <Text style={styles.hudBig}>{az != null ? `${Math.round(az)}° ${cardinal(az)}` : '—'}</Text>
          <Text style={styles.hudSmall}>
            {viewpoint.kind === 'gps' ? 'GPS' : viewpoint.label} · incl. {pitch.toFixed(0)}°
            {headingOffset !== 0 ? ` · corr. ${headingOffset > 0 ? '+' : ''}${headingOffset.toFixed(1)}°` : ''}
          </Text>
          {horizonStatus.loading && <Text style={styles.hudSmall}>Calcolo terreno {Math.round(horizonStatus.progress * 100)}%…</Text>}
          {!ori.magOk && <Text style={[styles.hudSmall, { color: C.warn }]}>Disturbo magnetico: allontanati da metallo o magneti</Text>}
          {gpsStatus === 'denied' && <Text style={[styles.hudSmall, { color: C.warn }]}>GPS negato: uso {viewpoint.label}</Text>}
        </View>
      </View>

      {targetInfo && (
        <View style={[styles.target, { top: insets.top + 90 }]}>
          <Text style={styles.targetText}>
            {targetOff
              ? `${targetDelta! > 0 ? 'Gira a destra →' : '← Gira a sinistra'} ${Math.abs(Math.round(targetDelta!))}° per ${targetInfo.peak.name}`
              : `${targetInfo.peak.name} · ${formatDistance(targetInfo.dist)}${targetInfo.visible === false ? ' · dietro al terreno' : ''}`}
          </Text>
          <Pressable onPress={() => setArTarget(null)} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={C.text} />
          </Pressable>
        </View>
      )}

      {Math.abs(pitch) > 45 && (
        <View style={styles.tilt}>
          <Text style={styles.tiltText}>Tieni il telefono in verticale verso le montagne</Text>
        </View>
      )}

      <View style={styles.tierBar}>
        <TierBar translucent />
      </View>

      {/* Controlli */}
      <View style={styles.controls}>
        <Ctrl icon="remove" onPress={() => setVFov((v) => Math.min(90, v + 3))} />
        <Text style={styles.ctrlLabel}>FOV {Math.round(vFov)}°</Text>
        <Ctrl icon="add" onPress={() => setVFov((v) => Math.max(20, v - 3))} />
        <View style={{ width: 12 }} />
        <Ctrl icon="refresh" onPress={() => setHeadingOffset(0)} />
        <Ctrl icon={ridgesOn ? 'analytics' : 'analytics-outline'} onPress={() => setRidgesOn((r) => !r)} />
      </View>
      <Text style={styles.hint}>Trascina di lato per allineare i nomi alle cime · tocca un nome per i dettagli</Text>
    </View>
  );
}

function importance(i: PeakInfo) {
  return i.peak.ele / 1000 + i.angle * 1.5 - i.dist / 50000;
}

function Ctrl({ icon, onPress }: { icon: any; onPress: () => void }) {
  return (
    <Pressable style={styles.ctrl} onPress={onPress}>
      <Ionicons name={icon} size={18} color={C.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 10 },
  permTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  permText: { color: C.sub, textAlign: 'center' },
  permBtn: { backgroundColor: C.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22, marginTop: 8 },
  permBtnText: { color: C.bg, fontWeight: '800' },
  hud: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  hudBox: { backgroundColor: 'rgba(14,22,32,0.7)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  hudBig: { color: C.text, fontSize: 20, fontWeight: '800' },
  hudSmall: { color: C.sub, fontSize: 11, marginTop: 2, textAlign: 'center' },
  target: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accent2,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  targetText: { color: C.bg, fontWeight: '700' },
  tilt: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    backgroundColor: 'rgba(14,22,32,0.8)',
    padding: 12,
    borderRadius: 12,
  },
  tiltText: { color: C.text, fontWeight: '600' },
  controls: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(14,22,32,0.7)',
    borderRadius: 24,
    padding: 6,
  },
  ctrl: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  ctrlLabel: { color: C.text, fontWeight: '600', minWidth: 60, textAlign: 'center' },
  tierBar: { position: 'absolute', bottom: 84, left: 0, right: 0 },
  hint: { position: 'absolute', bottom: 8, left: 12, right: 12, color: '#fff', fontSize: 11, textAlign: 'center', opacity: 0.8 },
});
