import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppState';
import { PROFILE_ORDER, PROFILES, Tier, TIER_STYLE } from '../lib/tiers';
import { C } from '../theme';

/** Scelta del profilo (montagna/valle/pianura) e interruttori dei tre livelli. */
export default function TierBar({ translucent }: { translucent?: boolean }) {
  const { profile, profileIsAuto, setProfile, tiersOn, toggleTier } = useApp();
  const p = PROFILES[profile];
  const next = () => setProfile(PROFILE_ORDER[(PROFILE_ORDER.indexOf(profile) + 1) % PROFILE_ORDER.length]);
  const bg = translucent ? 'rgba(14,22,32,0.72)' : C.panel;
  const names: Record<Tier, string> = { 1: `≤${p.near} km ★`, 2: `${p.near}–${p.far} km`, 3: `>${p.far} km` };
  return (
    <View style={styles.row}>
      <Pressable
        onPress={next}
        onLongPress={() => setProfile(null)}
        style={[styles.chip, { backgroundColor: bg }]}
      >
        <Text style={styles.profile}>
          {p.label}
          {profileIsAuto ? ' (auto)' : ''}
        </Text>
      </Pressable>
      {([1, 2, 3] as Tier[]).map((t) => {
        const on = tiersOn[t];
        const st = TIER_STYLE[t];
        return (
          <Pressable
            key={t}
            onPress={() => toggleTier(t)}
            style={[styles.chip, { backgroundColor: on ? bg : 'transparent', borderColor: on ? C.accent : C.line }]}
          >
            <View style={[styles.dot, { width: 4 + st.fontSize / 2, height: 4 + st.fontSize / 2, opacity: on ? st.opacity : 0.25 }]} />
            <Text style={[styles.tierText, !on && styles.off, { fontWeight: st.bold ? '800' : '500' }]}>{names[t]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', paddingHorizontal: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  profile: { color: C.accent, fontWeight: '800', fontSize: 12 },
  tierText: { color: C.text, fontSize: 12 },
  off: { color: C.sub, textDecorationLine: 'line-through' },
  dot: { borderRadius: 10, backgroundColor: '#FFFFFF' },
});
