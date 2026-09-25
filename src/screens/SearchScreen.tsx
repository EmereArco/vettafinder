import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PeakInfo, useApp } from '../state/AppState';
import { REGIONS } from '../data/peaks';
import { cardinal, formatDistance, normalizeText } from '../lib/geo';
import { C } from '../theme';

type Sort = 'dist' | 'ele' | 'name';
const FILTERS = ['Tutte', '4000+', ...REGIONS];

export default function SearchScreen() {
  const { infos, openPeak, viewpoint } = useApp();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('Tutte');
  const [sort, setSort] = useState<Sort>('dist');

  const list = useMemo(() => {
    const nq = normalizeText(q.trim());
    let r = infos.filter((i) => {
      if (nq && !normalizeText(`${i.peak.name} ${i.peak.area}`).includes(nq)) return false;
      if (filter === '4000+') return i.peak.ele >= 4000;
      if (filter !== 'Tutte') return i.peak.region === filter;
      return true;
    });
    r = [...r].sort((a, b) =>
      sort === 'dist' ? a.dist - b.dist : sort === 'ele' ? b.peak.ele - a.peak.ele : a.peak.name.localeCompare(b.peak.name, 'it'),
    );
    return r;
  }, [infos, q, filter, sort]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.h1}>Cerca una vetta</Text>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={C.sub} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Monviso, Rocciamelone, Écrins…"
          placeholderTextColor={C.sub}
          style={styles.input}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipOn]}>
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>{f}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.sortRow}>
        <Text style={styles.count}>
          {list.length} cime · distanze da {viewpoint.kind === 'gps' ? 'te' : viewpoint.label}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(
            [
              ['dist', 'Vicine'],
              ['ele', 'Alte'],
              ['name', 'A-Z'],
            ] as [Sort, string][]
          ).map(([k, l]) => (
            <Pressable key={k} onPress={() => setSort(k)}>
              <Text style={[styles.sortBtn, sort === k && { color: C.accent }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={list}
        keyExtractor={(i) => i.peak.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <Row info={item} onPress={() => openPeak(item.peak)} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

function Row({ info, onPress }: { info: PeakInfo; onPress: () => void }) {
  const { peak } = info;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.panel2 }]}>
      <View style={styles.tri}>
        <Ionicons name="triangle" size={18} color={peak.ele >= 4000 ? C.accent : C.accent2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {peak.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {peak.area} · {peak.region}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.ele}>{peak.ele} m</Text>
        <Text style={styles.meta}>
          {formatDistance(info.dist)} {cardinal(info.brg)}
          {info.visible === true ? ' · 👁' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16 },
  h1: { color: C.text, fontSize: 26, fontWeight: '800', marginBottom: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.panel,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  input: { flex: 1, color: C.text, paddingVertical: 12, fontSize: 16 },
  chips: { flexGrow: 0, marginTop: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: C.panel },
  chipOn: { backgroundColor: C.accent },
  chipText: { color: C.sub, fontWeight: '600' },
  chipTextOn: { color: C.bg },
  sortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  count: { color: C.sub, fontSize: 12, flex: 1, marginRight: 8 },
  sortBtn: { color: C.sub, fontWeight: '700', paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderRadius: 8 },
  tri: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center' },
  name: { color: C.text, fontSize: 16, fontWeight: '600' },
  meta: { color: C.sub, fontSize: 12, marginTop: 2 },
  ele: { color: C.text, fontWeight: '700' },
  sep: { height: 1, backgroundColor: C.line },
});
