import React from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/AppState';
import { cardinal, formatDistance, formatEle } from '../lib/geo';
import { C } from '../theme';

export default function PeakSheet() {
  const { selected, closePeak, infoById, viewpoint, showOnMap, viewFromPeak, setArTarget, setTab, horizon } = useApp();
  const insets = useSafeAreaInsets();
  const info = selected ? infoById.get(selected.id) : undefined;

  const openExternalMap = () => {
    if (!selected) return;
    const { lat, lon, name } = selected;
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(name)}&t=k`
        : `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(name)})`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closePeak}>
      <Pressable style={styles.backdrop} onPress={closePeak} />
      {selected && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{selected.name}</Text>
              <Text style={styles.sub}>
                {[selected.area, selected.region].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={styles.ele}>{formatEle(selected.ele)}</Text>
          </View>

          {info && (
            <View style={styles.stats}>
              <Stat icon="swap-horizontal" label="Distanza" value={formatDistance(info.dist)} />
              <Stat
                icon="navigate"
                label="Direzione"
                value={`${Math.round(info.brg)}° ${cardinal(info.brg)}`}
                rotate={info.brg}
              />
              <Stat icon="trending-up" label="Elevazione" value={`${info.angle.toFixed(1).replace('.', ',')}°`} />
            </View>
          )}

          {info && (
            <Text style={styles.visibility}>
              {info.dist < 100
                ? 'Sei qui.'
                : info.visible == null
                  ? horizon
                    ? ''
                    : `Da "${viewpoint.label}". Apri Panorama o AR per calcolare se è visibile.`
                  : info.visible
                    ? `✓ Visibile da "${viewpoint.label}"`
                    : `✕ Nascosta dal terreno vista da "${viewpoint.label}"`}
            </Text>
          )}

          <Text style={styles.coords}>
            {selected.lat.toFixed(4)}° N, {selected.lon.toFixed(4)}° E
          </Text>

          <View style={styles.actions}>
            <Action icon="map" label="Sulla mappa" onPress={() => showOnMap(selected)} />
            <Action icon="image" label="Panorama dalla vetta" onPress={() => viewFromPeak(selected)} />
            <Action
              icon="camera"
              label="Trova in AR"
              onPress={() => {
                setArTarget(selected);
                closePeak();
                setTab('ar');
              }}
            />
            <Action icon="open-outline" label="Apri in Mappe" onPress={openExternalMap} />
          </View>
        </View>
      )}
    </Modal>
  );
}

function Stat({ icon, label, value, rotate }: { icon: any; label: string; value: string; rotate?: number }) {
  return (
    <View style={styles.stat}>
      <View style={rotate != null ? { transform: [{ rotate: `${rotate - 45}deg` }] } : undefined}>
        <Ionicons name={icon} size={18} color={C.accent2} />
      </View>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={C.bg} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  name: { color: C.text, fontSize: 22, fontWeight: '700' },
  sub: { color: C.sub, marginTop: 2 },
  ele: { color: C.accent, fontSize: 22, fontWeight: '700' },
  stats: { flexDirection: 'row', marginTop: 16, gap: 8 },
  stat: { flex: 1, backgroundColor: C.panel2, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 },
  statVal: { color: C.text, fontWeight: '700', fontSize: 15 },
  statLabel: { color: C.sub, fontSize: 11 },
  visibility: { color: C.sub, marginTop: 12 },
  coords: { color: C.sub, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  action: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  actionText: { color: C.bg, fontWeight: '700', flexShrink: 1 },
});
