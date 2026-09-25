import type { Peak } from '../data/peaks';
import { distance, normalizeText } from './geo';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

function parseEle(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let v = parseFloat(m[0]);
  if (/ft/i.test(raw)) v *= 0.3048;
  // "3.841" scritto all'italiana = 3841
  if (v < 10 && /^\d\.\d{3}$/.test(m[0])) v *= 1000;
  return v;
}

/**
 * Scarica da OpenStreetMap le cime con nome e quota in un raggio (km) dal punto.
 */
export async function loadOsmPeaks(lat: number, lon: number, radiusKm = 50, minEle = 800): Promise<Peak[]> {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon}`;
  const query = `[out:json][timeout:40];node["natural"="peak"]["name"]["ele"](${bbox});out body;`;
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`OpenStreetMap non risponde (${res.status})`);
  const json = await res.json();
  const out: Peak[] = [];
  for (const el of json.elements ?? []) {
    const ele = parseEle(el.tags?.ele);
    if (ele == null || ele < minEle) continue;
    const name: string = el.tags['name:it'] || el.tags.name;
    out.push({
      id: `osm-${el.id}`,
      name,
      lat: el.lat,
      lon: el.lon,
      ele: Math.round(ele),
      area: 'OpenStreetMap',
      region: guessRegion(el.lat, el.lon),
      source: 'osm',
    });
  }
  return out;
}

// Stima grossolana: confine IT/FR ~ lungo lo spartiacque, basta per i filtri della demo.
function guessRegion(lat: number, lon: number) {
  if (lat > 46.0 && lon > 7.0 && lon < 8.4) return 'Svizzera';
  const borderLon = lat > 45.5 ? 6.95 : lat > 45.0 ? 6.9 : lat > 44.5 ? 6.95 : 7.2;
  return lon < borderLon ? 'Francia' : 'Piemonte';
}

/** Unisce le cime OSM a quelle esistenti evitando duplicati. */
export function mergePeaks(base: Peak[], extra: Peak[]) {
  const result = [...base];
  const names = new Set(base.map((p) => normalizeText(p.name)));
  for (const p of extra) {
    if (names.has(normalizeText(p.name))) continue;
    if (result.some((q) => Math.abs(q.lat - p.lat) < 0.01 && distance(q.lat, q.lon, p.lat, p.lon) < 400)) continue;
    result.push(p);
    names.add(normalizeText(p.name));
  }
  return result;
}
