import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProvider, Tab, useApp } from './src/state/AppState';
import MapScreen from './src/screens/MapScreen';
import SearchScreen from './src/screens/SearchScreen';
import ARScreen from './src/screens/ARScreen';
import PanoramaScreen from './src/screens/PanoramaScreen';
import PeakSheet from './src/components/PeakSheet';
import { C } from './src/theme';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'map', label: 'Mappa', icon: 'map' },
  { key: 'search', label: 'Cerca', icon: 'search' },
  { key: 'ar', label: 'AR', icon: 'camera' },
  { key: 'panorama', label: 'Panorama', icon: 'image' },
];

function Shell() {
  const { tab, setTab } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.flex}>
        {tab === 'map' && <MapScreen />}
        {tab === 'search' && <SearchScreen />}
        {tab === 'ar' && <ARScreen />}
        {tab === 'panorama' && <PanoramaScreen />}
      </View>
      <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <Ionicons name={on ? t.icon : (`${String(t.icon)}-outline` as any)} size={22} color={on ? C.accent : C.sub} />
              <Text style={[styles.tabText, on && { color: C.accent }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <PeakSheet />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    backgroundColor: C.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabText: { color: C.sub, fontSize: 11, fontWeight: '600' },
});
