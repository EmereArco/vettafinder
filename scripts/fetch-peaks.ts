// Eseguito in CI prima della compilazione: scarica le cime da OpenStreetMap (Overpass)
// e scrive src/data/peaks.generated.json. Confronta anche l'elenco scritto a mano.
import { writeFileSync } from 'fs';
import { HAND_PEAKS, Peak } from '../src/data/peaks';
import { distance, normalizeText } from '../src/lib/geo';

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// Regione amministrativa → etichetta, con un riquadro per limitarci alle Alpi occidentali.
const AREAS: { iso: string; label: string; bbox: string }[] = [
  { iso: 'IT-21', label: 'Piemonte', bbox: '43.9,6.5,46.5,9.3' },
  { iso: 'IT-23', label: "Valle d'Aosta", bbox: '45.4,6.7,46.0,8.0' },
  { iso: 'IT-42', label: 'Liguria', bbox: '43.7,7.4,44.5,8.5' },
  { iso: 'FR-ARA', label: 'Francia', bbox: '44.1,5.0,46.5,7.3' },
  { iso: 'FR-PAC', label: 'Francia', bbox: '43.6,5.0,45.2,7.8' },
  { iso: 'CH-VS', label: 'Svizzera', bbox: '45.8,6.8,46.5,8.5' },
];
const MIN_ELE = 300;

type OsmNode = { id: number; lat: number; lon: number; tags: Record<string, string> };

function parseEle(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let v = parseFloat(m[0]);
  if (/ft/i.test(raw)) v *= 0.3048;
  if (v < 10 && /^\d\.\d{3}$/.test(m[0])) v *= 1000;
  return v;
}

async function overpass(query: string): Promise<OsmNode[]> {
  let last = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'VettaFinder-build/1.0' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: any = await res.json();
      return json.elements ?? [];
    } catch (e: any) {
      last = `${url}: ${e?.message ?? e}`;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  throw new Error(`Overpass non raggiungibile (${last})`);
}

function sameName(a: string, b: string) {
  const wa = new Set(normalizeText(a).split(/[^a-z]+/).filter((w) => w.length > 3));
  return normalizeText(b)
    .split(/[^a-z]+/)
    .some((w) => w.length > 3 && wa.has(w) && !['monte', 'punta', 'pointe', 'aiguille', 'cima', 'rocca', 'grand', 'grande'].includes(w));
}

async function main() {
  const byId = new Map<number, { node: OsmNode; regions: Set<string> }>();
  for (const a of AREAS) {
    const q = `[out:json][timeout:240];area["ISO3166-2"="${a.iso}"]->.a;node["natural"="peak"]["name"]["ele"](area.a)(${a.bbox});out body;`;
    const nodes = await overpass(q);
    console.log(`${a.iso}: ${nodes.length} cime`);
    for (const n of nodes) {
      const e = byId.get(n.id) ?? { node: n, regions: new Set<string>() };
      e.regions.add(a.label);
      byId.set(n.id, e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  const regionOf = (r: Set<string>) => {
    const it = r.has('Piemonte') || r.has("Valle d'Aosta") || r.has('Liguria');
    if (it && r.has('Francia')) return 'Confine IT/FR';
    if (it && r.has('Svizzera')) return 'Confine IT/CH';
    return [...r][0];
  };

  const peaks: Peak[] = [];
  for (const { node, regions } of byId.values()) {
    const ele = parseEle(node.tags.ele);
    if (ele == null || ele < MIN_ELE || ele > 4900) continue;
    peaks.push({
      id: `osm-${node.id}`,
      name: node.tags['name:it'] || node.tags.name,
      lat: Math.round(node.lat * 1e5) / 1e5,
      lon: Math.round(node.lon * 1e5) / 1e5,
      ele: Math.round(ele),
      area: '',
      region: regionOf(regions),
      source: 'base',
    });
  }

  // --- Confronto con l'elenco scritto a mano ---
  const report: { name: string; d: number; dEle: number }[] = [];
  const missing: string[] = [];
  for (const h of HAND_PEAKS) {
    let best: Peak | null = null;
    let bd = Infinity;
    for (const p of peaks) {
      if (Math.abs(p.lat - h.lat) > 0.05 || Math.abs(p.lon - h.lon) > 0.07) continue;
      const d = distance(h.lat, h.lon, p.lat, p.lon);
      const named = sameName(h.name, p.name);
      // preferisci lo stesso nome entro 5 km, altrimenti una cima di quota simile entro 600 m
      const ok = (named && d < 5000) || (d < 600 && Math.abs(p.ele - h.ele) < 150);
      const score = named ? d : d + 3000;
      if (ok && score < bd) {
        bd = score;
        best = p;
      }
    }
    if (!best) {
      missing.push(h.name); // scartata: meglio nessuna cima che una nel posto sbagliato
      continue;
    }
    const d = distance(h.lat, h.lon, best.lat, best.lon);
    report.push({ name: h.name, d, dEle: best.ele - h.ele });
    // Stessa cima certa (nome simile e quota quasi uguale): prendo il nome comune e il gruppo.
    if (sameName(h.name, best.name) && Math.abs(best.ele - h.ele) <= 60) {
      best.area = h.area;
      best.name = h.name;
    }
  }

  peaks.sort((a, b) => b.ele - a.ele);
  writeFileSync('src/data/peaks.generated.json', JSON.stringify(peaks));

  report.sort((a, b) => b.d - a.d);
  const ds = report.map((r) => r.d).sort((a, b) => a - b);
  const med = ds[Math.floor(ds.length / 2)] ?? 0;
  const worst = report
    .slice(0, 12)
    .map((r) => `${r.name} ${Math.round(r.d)} m (quota ${r.dEle >= 0 ? '+' : ''}${r.dEle})`)
    .join('; ');
  const counts = [...new Set(peaks.map((p) => p.region))].map((r) => `${r} ${peaks.filter((p) => p.region === r).length}`).join(', ');
  console.log(`::notice title=cime::${peaks.length} cime (${counts})`);
  console.log(
    `::notice title=confronto::Elenco a mano: ${report.length} trovate in OSM, errore mediano ${Math.round(med)} m, oltre 500 m: ${ds.filter((d) => d > 500).length}. Peggiori: ${worst}. Non trovate: ${missing.join(', ') || 'nessuna'}`,
  );
  if (peaks.length < 500) throw new Error(`troppo poche cime (${peaks.length})`);
}

main().catch((e) => {
  console.log(`::warning title=cime::${String(e?.message ?? e)} — uso l'elenco scritto a mano`);
  process.exit(0); // la build continua con l'elenco di riserva
});
