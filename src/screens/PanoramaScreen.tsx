import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PeakInfo, useApp } from '../state/AppState';
import { DEFAULT_VIEWPOINT } from '../data/peaks';
import { angleDiff, cardinal, formatEle, norm360 } from '../lib/geo';
import { BAND_LIMITS_KM, horizonAngle, Horizon } from '../lib/terrain';
import { useHeading } from '../lib/sensors';
import { C } from '../theme';

const COMPASS_H = 38;
const LABEL_ZONE = 150;
const MAX_LABEL_DIST = 200000;

export default function PanoramaScreen() {
  const { viewpoint, horizon, horizonStatus, retryHorizon, infos, openPeak, setManualViewpoint, setTab, gps } = useApp();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [px, setPx] = useState(12); // pixel per grado
  const [center, setCenter] = useState(270); // Ovest: le Alpi viste dalla pianura
  const [follow, setFollow] = useState(false);
  const { heading } = useHeading(follow);

  const centerAz = follow && heading != null ? heading : center;

  // --- Cime candidate (visibili) ---
  const candidates = useMemo(() => {
    return infos.filter(
      (i) =>
        i.dist > 100 &&
        i.dist < MAX_LABEL_DIST &&
        (i.visible === true || (i.visible === null && i.angle > -1.5)),
    );
  }, [infos]);

  // --- Scala verticale globale (non cambia durante il trascinamento) ---
  const { minA, vScale } = useMemo(() => {
    let lo = -2;
    let hi = 2;
    if (horizon) {
      let m = 90;
      for (let a = 0; a < 360; a += 2) m = Math.min(m, horizonAngle(horizon, a));
      lo = Math.max(-6, Math.min(0, Math.floor(m) - 0.5));
      for (let a = 0; a < 360; a += 2) hi = Math.max(hi, horizonAngle(horizon, a));
    }
    for (const c of candidates) hi = Math.max(hi, c.angle);
    const avail = Math.max(80, size.h - COMPASS_H - LABEL_ZONE);
    return { minA: lo, vScale: Math.min(px * 3, avail / (hi - lo + 0.3)) };
  }, [horizon, candidates, size.h, px]);

  const baseY = size.h - COMPASS_H;
  const yOf = (angle: number) => baseY - (angle - minA) * vScale;
  const xOf = (az: number) => size.w / 2 + angleDiff(az, centerAz) * px;
  const halfSpan = size.w / 2 / px + 1;

  // --- Etichette senza sovrapposizioni ---
  const labels = useMemo(() => {
    const inWin = candidates
      .map((c) => ({ c, dx: angleDiff(c.brg, centerAz) }))
      .filter((o) => Math.abs(o.dx) < halfSpan);
    inWin.sort((a, b) => score(b.c) - score(a.c));
    const chosen: { c: PeakInfo; x: number }[] = [];
    for (const o of inWin) {
      const x = size.w / 2 + o.dx * px;
      if (chosen.every((k) => Math.abs(k.x - x) > 17)) chosen.push({ c: o.c, x });
      if (chosen.length >= 40) break;
    }
    return chosen;
  }, [candidates, centerAz, halfSpan, px, size.w]);

  // --- Gesti: trascina per ruotare, tocca un'etichetta per aprirla ---
  const st = useRef({ startCenter: 0, px, labels, size, centerAz });
  st.current.px = px;
  st.current.labels = labels;
  st.current.size = size;
  st.current.centerAz = centerAz;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
      onPanResponderGrant: () => {
        st.current.startCenter = st.current.centerAz;
        setFollow(false);
      },
      onPanResponderMove: (_, g) => {
        setCenter(norm360(st.current.startCenter - g.dx / st.current.px));
      },
      onPanResponderRelease: (e, g) => {
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          const { locationX } = e.nativeEvent;
          let best: PeakInfo | null = null;
          let bd = 22;
          for (const l of st.current.labels) {
            const d = Math.abs(l.x - locationX);
            if (d < bd) {
              bd = d;
              best = l.c;
            }
          }
          if (best) openPeak(best.peak);
        }
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const changeViewpoint = () => {
    Alert.alert('Punto di vista', 'Da dove vuoi guardare?', [
      {
        text: gps ? 'La mia posizione (GPS)' : 'La mia posizione (GPS non disponibile)',
        onPress: () => setManualViewpoint(null),
      },
      {
        text: 'Torino – Monte dei Cappuccini',
        onPress: () => setManualViewpoint({ ...DEFAULT_VIEWPOINT, kind: 'default' }),
      },
      { text: 'Scegli una vetta…', onPress: () => setTab('search') },
      { text: 'Annulla', style: 'cancel' },
    ]);
  };

  const ready = size.w > 0;
  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1} numberOfLines={1}>
            {viewpoint.label}
          </Text>
          <Text style={styles.sub}>
            {horizon ? `Quota occhio ${formatEle(horizon.eye)} · ` : ''}
            {Math.round(centerAz)}° {cardinal(centerAz)} · {labels.length} cime in vista
          </Text>
        </View>
        <Pressable style={styles.btn} onPress={changeViewpoint}>
          <Ionicons name="location" size={16} color={C.bg} />
          <Text style={styles.btnText}>Cambia</Text>
        </Pressable>
      </View>

      {horizonStatus.loading && (
        <View style={styles.status}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={styles.statusText}>Calcolo del terreno… {Math.round(horizonStatus.progress * 100)}%</Text>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${horizonStatus.progress * 100}%` }]} />
          </View>
        </View>
      )}
      {horizonStatus.error && (
        <Pressable style={styles.status} onPress={retryHorizon}>
          <Ionicons name="warning" size={16} color={C.warn} />
          <Text style={styles.statusText}>
            Terreno non disponibile ({horizonStatus.error}). Mostro solo le cime. Tocca per riprovare.
          </Text>
        </Pressable>
      )}

      <View style={styles.canvas} onLayout={onLayout} {...pan.panHandlers}>
        {ready && (
          <Svg width={size.w} height={size.h}>
            <Defs>
              <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={C.sky1} />
                <Stop offset="1" stopColor={C.sky2} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={size.w} height={baseY} fill="url(#sky)" />

            {horizon ? (
              <Ridges h={horizon} centerAz={centerAz} halfSpan={halfSpan} xOf={xOf} yOf={yOf} baseY={baseY} />
            ) : (
              <FallbackRidge
                peaks={candidates}
                centerAz={centerAz}
                halfSpan={halfSpan}
                xOf={xOf}
                yOf={yOf}
                baseY={baseY}
              />
            )}

            {labels.map(({ c, x }) => {
              const y = yOf(c.angle);
              const top = Math.min(LABEL_ZONE - 10, y - 12);
              const big = c.peak.ele >= 4000;
              return (
                <G key={c.peak.id}>
                  <Line x1={x} y1={y - 2} x2={x} y2={top} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={1} />
                  <SvgText
                    x={x + 4}
                    y={top - 2}
                    fill={big ? C.accent : '#FFFFFF'}
                    fontSize={12}
                    fontWeight={big ? 'bold' : 'normal'}
                    transform={`rotate(-60 ${x + 4} ${top - 2})`}
                  >
                    {`${c.peak.name} ${c.peak.ele}`}
                  </SvgText>
                </G>
              );
            })}

            <CompassStrip w={size.w} y={baseY} centerAz={centerAz} px={px} halfSpan={halfSpan} />
          </Svg>
        )}
      </View>

      <View style={styles.toolbar}>
        <Tool icon="remove" onPress={() => setPx((p) => Math.max(5, p / 1.4))} />
        <Tool icon="add" onPress={() => setPx((p) => Math.min(40, p * 1.4))} />
        <Tool
          icon="compass"
          label={follow ? 'Bussola ON' : 'Segui bussola'}
          active={follow}
          onPress={() => setFollow((f) => !f)}
        />
        <Tool icon="arrow-up" label="N" onPress={() => { setFollow(false); setCenter(0); }} />
      </View>
      <Text style={styles.footnote}>
        Trascina per ruotare · tocca un nome per i dettagli · rilievo esagerato in verticale
      </Text>
    </View>
  );
}

function score(i: PeakInfo) {
  // Preferisci cime alte e vicine, e quelle che "svettano"
  return i.peak.ele / 1000 + i.angle * 1.5 - i.dist / 60000;
}

type DrawProps = {
  centerAz: number;
  halfSpan: number;
  xOf: (az: number) => number;
  yOf: (a: number) => number;
  baseY: number;
};

function ridgePath(fn: (az: number) => number, { centerAz, halfSpan, xOf, yOf, baseY }: DrawProps) {
  const step = 0.5;
  let d = '';
  let firstX = 0;
  let lastX = 0;
  for (let o = -halfSpan; o <= halfSpan; o += step) {
    const az = norm360(centerAz + o);
    const x = xOf(az);
    const y = Math.min(baseY, yOf(fn(az)));
    if (!d) {
      d = `M${x.toFixed(1)},${y.toFixed(1)}`;
      firstX = x;
    } else d += `L${x.toFixed(1)},${y.toFixed(1)}`;
    lastX = x;
  }
  return { line: d, fill: `${d}L${lastX.toFixed(1)},${baseY}L${firstX.toFixed(1)},${baseY}Z` };
}

function Ridges({ h, ...p }: DrawProps & { h: Horizon }) {
  const bands = [...BAND_LIMITS_KM].reverse(); // dal più lontano al più vicino
  return (
    <G>
      {bands.map((km, i) => {
        const { fill, line } = ridgePath((az) => horizonAngle(h, az, km * 1000), p);
        return (
          <G key={km}>
            <Path d={fill} fill={C.ridges[i]} />
            <Path d={line} stroke="#FFFFFF" strokeOpacity={0.35 - i * 0.06} strokeWidth={1} fill="none" />
          </G>
        );
      })}
    </G>
  );
}

function FallbackRidge({ peaks, ...p }: DrawProps & { peaks: PeakInfo[] }) {
  const near = peaks.filter((i) => i.dist < 150000);
  const fn = (az: number) => {
    let m = 0;
    for (const i of near) {
      const v = i.angle - Math.abs(angleDiff(az, i.brg)) * 0.5;
      if (v > m) m = v;
    }
    return m;
  };
  const { fill, line } = ridgePath(fn, p);
  return (
    <G>
      <Path d={fill} fill={C.ridges[1]} />
      <Path d={line} stroke="#FFFFFF" strokeOpacity={0.4} strokeWidth={1} fill="none" />
    </G>
  );
}

function CompassStrip({ w, y, centerAz, px, halfSpan }: { w: number; y: number; centerAz: number; px: number; halfSpan: number }) {
  const ticks: React.ReactNode[] = [];
  const minor = px >= 10 ? 1 : 5;
  const major = px >= 20 ? 5 : px >= 8 ? 10 : 30;
  const start = Math.floor((centerAz - halfSpan) / minor) * minor;
  for (let a = start; a <= centerAz + halfSpan; a += minor) {
    const az = norm360(a);
    const x = w / 2 + angleDiff(az, centerAz) * px;
    const isMajor = Math.round(az) % major === 0;
    const isCard = Math.round(az) % 45 === 0;
    ticks.push(
      <Line key={`t${a}`} x1={x} y1={y} x2={x} y2={y + (isMajor ? 10 : 5)} stroke={C.sub} strokeWidth={1} />,
    );
    if (isMajor || isCard)
      ticks.push(
        <SvgText
          key={`l${a}`}
          x={x}
          y={y + 26}
          fill={isCard ? C.accent : C.sub}
          fontSize={isCard ? 13 : 11}
          fontWeight={isCard ? 'bold' : 'normal'}
          textAnchor="middle"
        >
          {isCard ? cardinal(az) : `${Math.round(az)}°`}
        </SvgText>,
      );
  }
  return (
    <G>
      <Rect x={0} y={y} width={w} height={COMPASS_H} fill={C.bg} />
      {ticks}
      <Line x1={w / 2} y1={y - 6} x2={w / 2} y2={y + 12} stroke={C.accent} strokeWidth={2} />
    </G>
  );
}

function Tool({ icon, label, onPress, active }: { icon: any; label?: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable style={[styles.tool, active && { backgroundColor: C.accent }]} onPress={onPress}>
      <Ionicons name={icon} size={18} color={active ? C.bg : C.text} />
      {label ? <Text style={[styles.toolText, active && { color: C.bg }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  h1: { color: C.text, fontSize: 20, fontWeight: '800' },
  sub: { color: C.sub, fontSize: 12, marginTop: 2 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  btnText: { color: C.bg, fontWeight: '700' },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: C.panel,
  },
  statusText: { color: C.sub, fontSize: 12, flex: 1 },
  progress: { width: '100%', height: 3, backgroundColor: C.line, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: C.accent, borderRadius: 2 },
  canvas: { flex: 1, overflow: 'hidden' },
  toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10, justifyContent: 'center' },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.panel,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toolText: { color: C.text, fontWeight: '600' },
  footnote: { color: C.sub, fontSize: 11, textAlign: 'center', paddingVertical: 8 },
});
