import UPNG from 'upng-js';
import { destination, elevationAngle, norm360 } from './geo';

/**
 * Profilo dell'orizzonte calcolato da un modello digitale del terreno.
 * Fonte: AWS Terrain Tiles (formato "terrarium", pubblico e senza chiave):
 *   https://registry.opendata.aws/terrain-tiles/
 * Si scaricano poche decine di tessere PNG (zoom 11 vicino, zoom 9 lontano),
 * si decodifica l'altitudine e si tracciano raggi ogni AZ_STEP gradi.
 * Per ogni raggio si salva il massimo angolo di elevazione cumulativo:
 * serve sia per disegnare le creste sia per capire se una cima è nascosta.
 */

export const AZ_STEP = 0.5;
const N_AZ = Math.round(360 / AZ_STEP);
const MIN_D = 200;
const MAX_D = 160000;
const N_D = 64;
export const DISTS: number[] = Array.from({ length: N_D }, (_, i) =>
  MIN_D * Math.pow(MAX_D / MIN_D, i / (N_D - 1)),
);
/** Limiti (km) dei "piani" di cresta nel panorama, dal vicino al lontano. */
export const BAND_LIMITS_KM = [8, 25, 60, 160];

const NEAR_Z = 11; // ~55 m/pixel alle nostre latitudini
const FAR_Z = 9; // ~220 m/pixel
const NEAR_LIMIT = 25000;
const zoomFor = (d: number) => (d < NEAR_LIMIT ? NEAR_Z : FAR_Z);

export type Horizon = {
  key: string;
  lat: number;
  lon: number;
  ground: number;
  eye: number;
  /** cumMax[az][i] = angolo massimo del terreno tra 0 e DISTS[i] lungo quell'azimut */
  cumMax: Float32Array[];
};

export type Viewpoint = { lat: number; lon: number; alt?: number | null };

const horizonCache = new Map<string, Horizon>();
export const horizonKey = (v: Viewpoint) =>
  `${v.lat.toFixed(3)},${v.lon.toFixed(3)},${v.alt != null ? Math.round(v.alt / 10) : 'g'}`;

// ---------- Tessere di altitudine ----------

const TILE = 256;
const tileCache = new Map<string, Float32Array>();
const MAX_TILES = 150;

const tileUrl = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

/** Coordinate "pixel globali" nel sistema Web Mercator allo zoom z. */
function worldPx(lat: number, lon: number, z: number) {
  const n = TILE * 2 ** z;
  const φ = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2) * n,
  };
}

async function fetchTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Float32Array> {
  const key = `${z}/${x}/${y}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(tileUrl(z, x, y), { signal });
      if (res.status === 404) {
        const sea = new Float32Array(TILE * TILE); // tessera mancante = mare
        tileCache.set(key, sea);
        return sea;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const img = UPNG.decode(buf);
      const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
      const el = new Float32Array(TILE * TILE);
      for (let i = 0, p = 0; i < el.length; i++, p += 4) {
        el[i] = rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768;
      }
      if (tileCache.size >= MAX_TILES) tileCache.delete(tileCache.keys().next().value as string);
      tileCache.set(key, el);
      return el;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw new Error(`Tessera ${key} non scaricata (${String((lastErr as Error)?.message ?? lastErr)})`);
}

function pixelAt(z: number, gx: number, gy: number) {
  const tx = Math.floor(gx / TILE);
  const ty = Math.floor(gy / TILE);
  const t = tileCache.get(`${z}/${tx}/${ty}`);
  if (!t) return 0;
  return t[(gy - ty * TILE) * TILE + (gx - tx * TILE)];
}

/** Altitudine interpolata (bilineare) dalle tessere già scaricate. */
export function elevationAt(lat: number, lon: number, z: number) {
  const { x, y } = worldPx(lat, lon, z);
  const x0 = Math.floor(x - 0.5);
  const y0 = Math.floor(y - 0.5);
  const fx = x - 0.5 - x0;
  const fy = y - 0.5 - y0;
  const a = pixelAt(z, x0, y0);
  const b = pixelAt(z, x0 + 1, y0);
  const c = pixelAt(z, x0, y0 + 1);
  const d = pixelAt(z, x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

async function loadTiles(
  needed: Set<string>,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
) {
  const list = [...needed];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < list.length) {
      const [z, x, y] = list[next++].split('/').map(Number);
      await fetchTile(z, x, y, signal);
      done++;
      onProgress?.(done / list.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

// ---------- Orizzonte ----------

export async function computeHorizon(
  vp: Viewpoint,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<Horizon> {
  const key = horizonKey(vp);
  const cached = horizonCache.get(key);
  if (cached) return cached;

  // Punti campione lungo i raggi + tessere necessarie
  const pts = new Float64Array(N_AZ * N_D * 2);
  const needed = new Set<string>();
  const addTile = (lat: number, lon: number, z: number) => {
    const { x, y } = worldPx(lat, lon, z);
    // anche i vicini, per l'interpolazione ai bordi della tessera
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
      needed.add(`${z}/${Math.floor((x + dx) / TILE)}/${Math.floor((y + dy) / TILE)}`);
    }
  };
  addTile(vp.lat, vp.lon, NEAR_Z);
  for (let a = 0; a < N_AZ; a++) {
    for (let i = 0; i < N_D; i++) {
      const p = destination(vp.lat, vp.lon, a * AZ_STEP, DISTS[i]);
      const k = (a * N_D + i) * 2;
      pts[k] = p.lat;
      pts[k + 1] = p.lon;
      addTile(p.lat, p.lon, zoomFor(DISTS[i]));
    }
  }

  await loadTiles(needed, onProgress, signal);

  const ground = elevationAt(vp.lat, vp.lon, NEAR_Z);
  const eye = (vp.alt != null ? Math.max(vp.alt, ground) : ground) + 2;

  const cumMax: Float32Array[] = [];
  for (let a = 0; a < N_AZ; a++) {
    const row = new Float32Array(N_D);
    let m = -90;
    for (let i = 0; i < N_D; i++) {
      const k = (a * N_D + i) * 2;
      const el = elevationAt(pts[k], pts[k + 1], zoomFor(DISTS[i]));
      const ang = elevationAngle(eye, el, DISTS[i]);
      if (ang > m) m = ang;
      row[i] = m;
    }
    cumMax.push(row);
  }
  const h: Horizon = { key, lat: vp.lat, lon: vp.lon, ground, eye, cumMax };
  horizonCache.set(key, h);
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
  const margin = Math.max(600, dist * 0.03);
  const idx = lastIndexBelow(dist - margin);
  if (idx < 0) return true;
  const ai = Math.round(norm360(az) / AZ_STEP) % N_AZ;
  // il raggio più basso tra quello della cima e i due vicini: evita falsi "nascosti"
  const blocker = Math.min(
    h.cumMax[ai][idx],
    h.cumMax[(ai + 1) % N_AZ][idx],
    h.cumMax[(ai - 1 + N_AZ) % N_AZ][idx],
  );
  return angle >= blocker - 0.3;
}
