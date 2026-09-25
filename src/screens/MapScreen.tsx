import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/AppState';
import { MAP_HTML } from './mapHtml';
import { C } from '../theme';

export default function MapScreen() {
  const { peaks, openPeak, mapFocus, gps, viewpoint, setManualViewpoint, setTab, addOsmPeaks, osmLoading } = useApp();
  const insets = useSafeAreaInsets();
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [sat, setSat] = useState(false);
  const center = useRef({ lat: 45, lon: 7, radiusKm: 60 });
  const peaksRef = useRef(peaks);
  peaksRef.current = peaks;

  const js = (code: string) => web.current?.injectJavaScript(`${code};true;`);

  // Sincronizza i dati con la pagina Leaflet
  useEffect(() => {
    if (!ready) return;
    const slim = peaks.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, ele: p.ele, osm: p.source === 'osm' }));
    js(`window.setPeaks(${JSON.stringify(slim)})`);
  }, [ready, peaks]);

  useEffect(() => {
    if (ready && gps) js(`window.setMe(${gps.lat}, ${gps.lon})`);
  }, [ready, gps?.lat, gps?.lon]);

  useEffect(() => {
    if (!ready) return;
    if (viewpoint.kind === 'gps') js('window.setVp(null)');
    else js(`window.setVp(${viewpoint.lat}, ${viewpoint.lon})`);
  }, [ready, viewpoint.kind, viewpoint.lat, viewpoint.lon]);

  useEffect(() => {
    if (ready && mapFocus) js(`window.flyTo(${mapFocus.peak.lat}, ${mapFocus.peak.lon}, 13)`);
  }, [ready, mapFocus]);

  useEffect(() => {
    if (ready) js(`window.setLayer('${sat ? 'sat' : 'topo'}')`);
  }, [ready, sat]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'move') center.current = { lat: msg.lat, lon: msg.lon, radiusKm: msg.radiusKm };
    else if (msg.type === 'peak') {
      const p = peaksRef.current.find((x) => x.id === msg.id);
      if (p) openPeak(p);
    } else if (msg.type === 'longpress') {
      const { lat, lon } = msg;
      Alert.alert('Punto panoramico', 'Vuoi vedere il panorama da questo punto?', [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Panorama',
          onPress: () => {
            setManualViewpoint({ lat, lon, alt: null, label: `Punto ${lat.toFixed(3)}, ${lon.toFixed(3)}`, kind: 'custom' });
            setTab('panorama');
          },
        },
      ]);
    }
  };

  const goToMe = () => {
    if (!gps) {
      Alert.alert('Posizione non disponibile', 'Consenti la posizione nelle impostazioni del telefono.');
      return;
    }
    js(`window.flyTo(${gps.lat}, ${gps.lon}, 12)`);
  };

  const loadOsm = async () => {
    try {
      const { lat, lon, radiusKm } = center.current;
      const n = await addOsmPeaks(lat, lon, Math.min(60, Math.max(10, radiusKm)));
      Alert.alert('OpenStreetMap', n > 0 ? `Aggiunte ${n} cime.` : 'Nessuna nuova cima in questa zona.');
    } catch (e: any) {
      Alert.alert('Errore', e?.message ?? 'Impossibile scaricare le cime');
    }
  };

  return (
    <View style={styles.flex}>
      <WebView
        ref={web}
        style={styles.flex}
        originWhitelist={['*']}
        source={{ html: MAP_HTML, baseUrl: 'https://vettafinder.local/' }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
      />
      {!ready && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={C.accent} />
          <Text style={styles.hint}>Carico la mappa…</Text>
        </View>
      )}

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="none">
        <Text style={styles.title}>VettaFinder</Text>
        <Text style={styles.hint}>Tieni premuto sulla mappa per un panorama da quel punto</Text>
      </View>

      <View style={styles.fabs}>
        <Fab icon={sat ? 'map' : 'earth'} onPress={() => setSat((s) => !s)} />
        <Fab icon="cloud-download" onPress={loadOsm} loading={osmLoading} />
        <Fab icon="locate" onPress={goToMe} />
      </View>
    </View>
  );
}

function Fab({ icon, onPress, loading }: { icon: any; onPress: () => void; loading?: boolean }) {
  return (
    <Pressable style={styles.fab} onPress={onPress} disabled={loading}>
      {loading ? <ActivityIndicator color={C.text} /> : <Ionicons name={icon} size={22} color={C.text} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8 },
  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: 'rgba(14,22,32,0.85)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  title: { color: C.text, fontWeight: '800', fontSize: 18 },
  hint: { color: C.sub, fontSize: 12, marginTop: 2 },
  fabs: { position: 'absolute', right: 12, bottom: 28, gap: 10 },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(14,22,32,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
