import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { BASE_PEAKS, DEFAULT_VIEWPOINT, Peak } from '../data/peaks';
import { bearing, distance, elevationAngle } from '../lib/geo';
import { computeHorizon, Horizon, horizonKey, isPeakVisible } from '../lib/terrain';
import { loadOsmPeaks, mergePeaks } from '../lib/osm';

export type Tab = 'map' | 'search' | 'ar' | 'panorama';

export type ViewpointKind = 'gps' | 'peak' | 'custom' | 'default';
export type AppViewpoint = {
  lat: number;
  lon: number;
  alt: number | null;
  label: string;
  kind: ViewpointKind;
};

export type GpsFix = { lat: number; lon: number; alt: number | null; altAccuracy: number | null };

export type PeakInfo = {
  peak: Peak;
  dist: number; // m
  brg: number; // gradi
  angle: number; // gradi di elevazione apparente
  visible: boolean | null; // null = terreno non ancora calcolato
};

type HorizonStatus = { loading: boolean; progress: number; error: string | null };

type Ctx = {
  tab: Tab;
  setTab: (t: Tab) => void;
  peaks: Peak[];
  osmLoading: boolean;
  addOsmPeaks: (lat: number, lon: number, radiusKm?: number) => Promise<number>;
  gps: GpsFix | null;
  gpsStatus: 'pending' | 'granted' | 'denied';
  viewpoint: AppViewpoint;
  setManualViewpoint: (vp: AppViewpoint | null) => void;
  viewFromPeak: (p: Peak) => void;
  horizon: Horizon | null;
  horizonStatus: HorizonStatus;
  retryHorizon: () => void;
  infos: PeakInfo[];
  infoById: Map<string, PeakInfo>;
  selected: Peak | null;
  openPeak: (p: Peak) => void;
  closePeak: () => void;
  mapFocus: { peak: Peak; ts: number } | null;
  showOnMap: (p: Peak) => void;
  arTarget: Peak | null;
  setArTarget: (p: Peak | null) => void;
  headingOffset: number;
  setHeadingOffset: (n: number | ((o: number) => number)) => void;
};

const AppContext = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp fuori da AppProvider');
  return c;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('map');
  const [peaks, setPeaks] = useState<Peak[]>(BASE_PEAKS);
  const [osmLoading, setOsmLoading] = useState(false);
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [manualVp, setManualVp] = useState<AppViewpoint | null>(null);
  const [horizon, setHorizon] = useState<Horizon | null>(null);
  const [horizonStatus, setHorizonStatus] = useState<HorizonStatus>({ loading: false, progress: 0, error: null });
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Peak | null>(null);
  const [mapFocus, setMapFocus] = useState<{ peak: Peak; ts: number } | null>(null);
  const [arTarget, setArTarget] = useState<Peak | null>(null);
  const [headingOffset, setHeadingOffset] = useState(0);

  // --- GPS ---
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsStatus('denied');
        return;
      }
      setGpsStatus('granted');
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 20, timeInterval: 5000 },
        (loc) =>
          setGps({
            lat: loc.coords.latitude,
            lon: loc.coords.longitude,
            alt: loc.coords.altitude,
            altAccuracy: loc.coords.altitudeAccuracy ?? null,
          }),
      );
    })().catch(() => setGpsStatus('denied'));
    return () => sub?.remove();
  }, []);

  const viewpoint: AppViewpoint = useMemo(() => {
    if (manualVp) return manualVp;
    if (gps) {
      const goodAlt = gps.alt != null && gps.altAccuracy != null && gps.altAccuracy < 25;
      return { lat: gps.lat, lon: gps.lon, alt: goodAlt ? gps.alt : null, label: 'La mia posizione', kind: 'gps' };
    }
    return { ...DEFAULT_VIEWPOINT, kind: 'default' };
  }, [manualVp, gps]);

  // --- Orizzonte dal DEM (solo quando serve: AR o Panorama) ---
  const needHorizon = tab === 'ar' || tab === 'panorama';
  const horizonOrigin = useRef<{ lat: number; lon: number; key: string; retry: number; kind: ViewpointKind } | null>(
    null,
  );
  const ctrlRef = useRef<AbortController | null>(null);
  useEffect(() => () => ctrlRef.current?.abort(), []);
  useEffect(() => {
    if (!needHorizon) return;
    const o = horizonOrigin.current;
    const key = horizonKey(viewpoint);
    // In GPS ricalcola solo se ci si è spostati di oltre 1 km (risparmia richieste).
    if (o && o.retry === retry && o.kind === viewpoint.kind) {
      if (viewpoint.kind === 'gps' && distance(o.lat, o.lon, viewpoint.lat, viewpoint.lon) < 1000) return;
      if (viewpoint.kind !== 'gps' && o.key === key) return;
    }
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    horizonOrigin.current = { lat: viewpoint.lat, lon: viewpoint.lon, key, retry, kind: viewpoint.kind };
    setHorizonStatus({ loading: true, progress: 0, error: null });
    if (o && distance(o.lat, o.lon, viewpoint.lat, viewpoint.lon) > 1000) setHorizon(null);
    computeHorizon(
      { lat: viewpoint.lat, lon: viewpoint.lon, alt: viewpoint.alt },
      (p) => setHorizonStatus((s) => ({ ...s, progress: p })),
      ctrl.signal,
    )
      .then((h) => {
        if (ctrl.signal.aborted) return;
        setHorizon(h);
        setHorizonStatus({ loading: false, progress: 1, error: null });
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setHorizon(null);
        setHorizonStatus({ loading: false, progress: 0, error: e?.message ?? 'Errore di rete' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needHorizon, viewpoint.lat, viewpoint.lon, viewpoint.alt, retry]);

  // --- Geometria delle cime rispetto al punto di vista ---
  const infos: PeakInfo[] = useMemo(() => {
    const eye = horizon ? horizon.eye : (viewpoint.alt ?? 300) + 2;
    return peaks.map((peak) => {
      const dist = distance(viewpoint.lat, viewpoint.lon, peak.lat, peak.lon);
      const brg = bearing(viewpoint.lat, viewpoint.lon, peak.lat, peak.lon);
      const angle = elevationAngle(eye, peak.ele, dist);
      const visible = horizon ? (dist < 100 ? false : isPeakVisible(horizon, brg, dist, angle)) : null;
      return { peak, dist, brg, angle, visible };
    });
  }, [peaks, viewpoint, horizon]);
  const infoById = useMemo(() => new Map(infos.map((i) => [i.peak.id, i])), [infos]);

  const addOsmPeaks = useCallback(async (lat: number, lon: number, radiusKm = 50) => {
    setOsmLoading(true);
    try {
      const extra = await loadOsmPeaks(lat, lon, radiusKm);
      let added = 0;
      setPeaks((prev) => {
        const merged = mergePeaks(prev, extra);
        added = merged.length - prev.length;
        return merged;
      });
      return added;
    } finally {
      setOsmLoading(false);
    }
  }, []);

  const viewFromPeak = useCallback((p: Peak) => {
    setManualVp({ lat: p.lat, lon: p.lon, alt: p.ele, label: `Vetta: ${p.name}`, kind: 'peak' });
    setSelected(null);
    setTab('panorama');
  }, []);

  const value: Ctx = {
    tab,
    setTab,
    peaks,
    osmLoading,
    addOsmPeaks,
    gps,
    gpsStatus,
    viewpoint,
    setManualViewpoint: setManualVp,
    viewFromPeak,
    horizon,
    horizonStatus,
    retryHorizon: () => setRetry((r) => r + 1),
    infos,
    infoById,
    selected,
    openPeak: setSelected,
    closePeak: () => setSelected(null),
    mapFocus,
    showOnMap: (p) => {
      setMapFocus({ peak: p, ts: Date.now() });
      setSelected(null);
      setTab('map');
    },
    arTarget,
    setArTarget,
    headingOffset,
    setHeadingOffset,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
