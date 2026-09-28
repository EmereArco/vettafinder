import React, { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PeakInfo, useApp } from '../state/AppState';
import { angleDiff, cardinal, formatDistance, norm360, toDeg, toRad } from '../lib/geo';
import { horizonAngle } from '../lib/terrain';
import { useCameraPitch, useHeading } from '../lib/sensors';
import { C } from '../theme';

const ROW_H = 30;

export default function ARScreen() {
  const { infos, horizon, horizonStatus, headingOffset, setHeadingOffset, arTarget, setArTarget, openPeak, viewpoint, gpsStatus } =
    useApp();
  const insets = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [vFov, setVFov] = useState(60); // campo visivo verticale (lato lungo) in gradi
  const { heading, accuracy } = useHeading(true);
  const pitch = useCameraPitch(true);

  const az = heading != null ? norm360(heading + headingOffset) : null;
  const f = size.h / 2 / Math.tan(toRad(vFov / 2)); // lunghezza focale in pixel
  const hFov = size.w > 0 ? 2 * toDeg(Math.atan(size.w / 2 / f)) : 30;

  const project = (brg: number, angle: number) => {
    const dAz = angleDiff(brg, az ?? 0);
    const x = size.w / 2 + f * Math.tan(toRad(dAz));
    const y = size.h / 2 - f * Math.tan(toRad(angle - pitch));
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
    cands.sort((a, b) => importance(b) - importance(a));
    if (arTarget) {
      const t = cands.findIndex((c) => c.peak.id === arTarget.id);
      if (t > 0) cands.unshift(cands.splice(t, 1)[0]);
    }
    const rows: { brg: number; half: number }[][] = [];
    const out: { c: PeakInfo; row: number; w: number }[] = [];
    for (const c of cands.slice(0, 250)) {
      const w = `${c.peak.name} ${c.peak.ele}`.length * 6.6 + 18;
      const half = (w / 2 + 3) / pxPerDeg;
      let r = 0;
      while (r < 6 && (rows[r] ?? []).some((o) => Math.abs(angleDiff(o.brg, c.brg)) < o.half + half)) r++;
      if (r >= 6) continue;
      (rows[r] = rows[r] ?? []).push({ brg: c.brg, half });
      out.push({ c, row: r, w });
    }
    return out;
  }, [infos, f, size.w, arTarget]);

  // --- Posizione a schermo (ogni fotogramma, solo proiezione) ---
  const labels = useMemo(() => {
    if (az == null || size.w === 0) return [];
    const out: { c: PeakInfo; x: number; y: number; ly: number; w: number }[] = [];
    for (const l of layout) {
      if (Math.abs(angleDiff(l.c.brg, az)) > hFov / 2 + 8) continue;
      const { x, y } = project(l.c.brg, l.c.angle);
      out.push({ c: l.c, x, y, w: l.w, ly: Math.max(insets.top + 70, y - 46 - l.row * ROW_H) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, az, pitch, size, vFov]);

  // --- Linea dell'orizzonte dal DEM ---
  const horizonPath = useMemo(() => {
    if (!horizon || az == null || size.w === 0) return '';
    let d = '';
    for (let o = -hFov / 2 - 2; o <= hFov / 2 + 2; o += 0.5) {
      const a = norm360(az + o);
      const { x, y } = project(a, horizonAngle(horizon, a));
      d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, az, pitch, size, vFov]);

  // --- Calibrazione: trascina in orizzontale per allineare la bussola ---
  const st = useRef({ start: 0, hFov, w: size.w, offset: headingOffset, labels });
  st.current.hFov = hFov;
  st.current.w = size.w;
  st.current.offset = headingOffset;
  st.current.labels = labels;
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
          const hit = st.current.labels.find(
            (l) => Math.abs(l.x - locationX) < l.w / 2 && Math.abs(l.ly - locationY) < ROW_H / 2 + 4,
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
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        {size.w > 0 && az != null && (
          <Svg width={size.w} height={size.h}>
            {horizonPath ? (
              <Path d={horizonPath} stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="6 4" fill="none" />
            ) : null}
            {labels.map(({ c, x, y, ly, w }) => {
              const isTarget = arTarget?.id === c.peak.id;
              const color = isTarget ? C.accent2 : c.peak.ele >= 4000 ? C.accent : '#FFFFFF';
              return (
                <G key={c.peak.id}>
                  <Line x1={x} y1={ly + 11} x2={x} y2={y} stroke={color} strokeWidth={1.2} strokeOpacity={0.85} />
                  <Circle cx={x} cy={y} r={3} fill={color} />
                  <Rect x={x - w / 2} y={ly - 11} width={w} height={22} rx={11} fill="rgba(14,22,32,0.72)" stroke={color} strokeWidth={isTarget ? 2 : 0} />
                  <SvgText x={x} y={ly + 4} fill={color} fontSize={12} fontWeight="bold" textAnchor="middle">
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
          {compassPoor(accuracy) && <Text style={[styles.hudSmall, { color: C.warn }]}>Bussola imprecisa: muovi il telefono a ∞</Text>}
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

      {/* Controlli */}
      <View style={styles.controls}>
        <Ctrl icon="remove" onPress={() => setVFov((v) => Math.min(90, v + 3))} />
        <Text style={styles.ctrlLabel}>FOV {Math.round(vFov)}°</Text>
        <Ctrl icon="add" onPress={() => setVFov((v) => Math.max(20, v - 3))} />
        <View style={{ width: 12 }} />
        <Ctrl icon="refresh" onPress={() => setHeadingOffset(0)} />
      </View>
      <Text style={styles.hint}>Trascina di lato per allineare i nomi alle cime · tocca un nome per i dettagli</Text>
    </View>
  );
}

// Android: livello 0–3 (3 = ottimo). iOS: errore in gradi.
function compassPoor(acc: number) {
  return Platform.OS === 'android' ? acc <= 1 : acc < 0 || acc > 25;
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
  hint: { position: 'absolute', bottom: 8, left: 12, right: 12, color: '#fff', fontSize: 11, textAlign: 'center', opacity: 0.8 },
});
