import { destination, elevationAngle, norm360 } from './geo';

/**
 * Profilo dell'orizzonte calcolato da un modello digitale del terreno (DEM).
 * Usa l'API gratuita di Open-Meteo (Copernicus DEM ~90 m), max 100 punti per richiesta.
 * Per ogni azimut (passo AZ_STEP gradi) campiona il terreno a distanze crescenti
 * e memorizza il massimo angolo di elevazione cumulativo: serve sia per disegnare
 * le creste sia per capire se una cima è nascosta da un rilievo più vicino.
 */

export const AZ_STEP = 2;
const N_AZ = 360 / AZ_STEP;
const MIN_D = 250;
const MAX_D = 160000;
const N_D = 40;
export const DISTS: number[] = Array.from({ length: N_D }, (_, i) =>
  MIN_D * Math.pow(MAX_D / MIN_D, i / (N_D - 1)),
);
/** Indici di distanza usati per i "piani" di cresta nel panorama (vicino → lontano). */
export const BAND_LIMITS_KM = [8, 25, 60, 160];

export type Horizon = {
  key: string;
  lat: number;
  lon: number;
  ground: number;
  eye: number;
  /** cumMax[az][i] = angolo massimo del terreno tra 0 e DISTS[i] lungo quell'azimut */
  cumMax: number[][];
};

export type Viewpoint = { lat: number; lon: number; alt?: number | null };

const cache = new Map<string, Horizon>();
export const horizonKey = (v: Viewpoint) =>
  `${v.lat.toFixed(3)},${v.lon.toFixed(3)},${v.alt != null ? Math.round(v.alt / 10) : 'g'}`;

const f4 = (n: number) => n.toFixed(4);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchBatch(pts: { lat: number; lon: number }[], signal?: AbortSignal): Promise<number[]> {
  const url =
    'https://api.open-meteo.com/v1/elevation?latitude=' +
    pts.map((p) => f4(p.lat)).join(',') +
    '&longitude=' +
    pts.map((p) => f4(p.lon)).join(',');
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { signal });
    if (res.ok) {
      const json = await res.json();
      return (json.elevation as (number | null)[]).map((e) => (e == null || Number.isNaN(e) ? 0 : e));
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    throw new Error(`Errore DEM ${res.status}`);
  }
  throw new Error('Servizio altimetrico non disponibile, riprova più tardi');
}

async function fetchElevations(
  pts: { lat: number; lon: number }[],
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
) {
  const out = new Array<number>(pts.length);
  const chunks: number[] = [];
  for (let i = 0; i < pts.length; i += 100) chunks.push(i);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const start = chunks[next++];
      const slice = pts.slice(start, start + 100);
      const els = await fetchBatch(slice, signal);
      els.forEach((e, j) => (out[start + j] = e));
      done++;
      onProgress?.(done / chunks.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

export async function computeHorizon(
  vp: Viewpoint,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<Horizon> {
  const key = horizonKey(vp);
  const cached = cache.get(key);
  if (cached) return cached;

  const pts: { lat: number; lon: number }[] = [{ lat: vp.lat, lon: vp.lon }];
  for (let a = 0; a < N_AZ; a++) {
    for (const d of DISTS) pts.push(destination(vp.lat, vp.lon, a * AZ_STEP, d));
  }
  const els = await fetchElevations(pts, onProgress, signal);
  const ground = els[0];
  const eye = (vp.alt != null ? Math.max(vp.alt, ground) : ground) + 2;

  const cumMax: number[][] = [];
  for (let a = 0; a < N_AZ; a++) {
    const row: number[] = [];
    let m = -90;
    for (let i = 0; i < N_D; i++) {
      const ang = elevationAngle(eye, els[1 + a * N_D + i], DISTS[i]);
      if (ang > m) m = ang;
      row.push(m);
    }
    cumMax.push(row);
  }
  const h: Horizon = { key, lat: vp.lat, lon: vp.lon, ground, eye, cumMax };
  cache.set(key, h);
  return h;
}

function lastIndexBelow(dist: number) {
  let i = -1;
  while (i + 1 < N_D && DISTS[i + 1] < dist) i++;
  return i;
}

/** Angolo dell'orizzonte (entro maxDist) interpolato tra i raggi. */
export function horizonAngle(h: Horizon, az: number, maxDist = MAX_D) {
  const idx = lastIndexBelow(maxDist + 1);
  if (idx < 0) return -90;
  const x = norm360(az) / AZ_STEP;
  const a0 = Math.floor(x) % N_AZ;
  const a1 = (a0 + 1) % N_AZ;
  const t = x - Math.floor(x);
  return h.cumMax[a0][idx] * (1 - t) + h.cumMax[a1][idx] * t;
}

/** true se una cima (azimut, distanza, angolo) non è coperta da terreno più vicino. */
export function isPeakVisible(h: Horizon, az: number, dist: number, angle: number) {
  const margin = Math.max(800, dist * 0.04);
  const idx = lastIndexBelow(dist - margin);
  if (idx < 0) return true;
  const ai = Math.round(norm360(az) / AZ_STEP) % N_AZ;
  const blocker = h.cumMax[ai][idx];
  return angle >= blocker - 0.25;
}
