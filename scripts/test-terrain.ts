// Test eseguito in CI: scarica il terreno attorno a Torino e verifica che i numeri tornino.
import { computeHorizon, elevationAt, isPeakVisible } from '../src/lib/terrain';
import { BASE_PEAKS } from '../src/data/peaks';
import { bearing, distance, elevationAngle } from '../src/lib/geo';
import { autoProfile, tierOf } from '../src/lib/tiers';

async function main() {
  const vp = { lat: 45.0597, lon: 7.6989, alt: 284 };
  const t0 = Date.now();
  let tiles = 0;
  const h = await computeHorizon(vp, (p) => (tiles = p));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const monviso = elevationAt(44.6673, 7.0906, 9);
  const visible = BASE_PEAKS.filter((p) => {
    const d = distance(vp.lat, vp.lon, p.lat, p.lon);
    return d > 100 && d < 200000 && isPeakVisible(h, bearing(vp.lat, vp.lon, p.lat, p.lon), d, elevationAngle(h.eye, p.ele, d));
  });
  const names = ['Monviso', 'Rocciamelone', 'Gran Paradiso', 'Monte Bianco', 'Punta Gnifetti', 'Superga'];
  const report = names.map((n) => `${n}: ${visible.some((p) => p.name.startsWith(n)) ? 'visibile' : 'nascosto'}`).join(', ');
  const msg = `Torino: suolo ${Math.round(h.ground)} m, Monviso DEM ${Math.round(monviso)} m, ${visible.length}/${BASE_PEAKS.length} cime visibili in ${secs}s (${tiles}). ${report}`;
  console.log(`::notice title=terreno::${msg}`);
  const prof = autoProfile(h.eye);
  const infos = visible.map((p) => {
    const d = distance(vp.lat, vp.lon, p.lat, p.lon);
    return { peak: p, dist: d, brg: 0, angle: 0, visible: true };
  });
  const t = [1, 2, 3].map((k) => infos.filter((i) => tierOf(i, prof) === k));
  const t1 = t[0].sort((a, b) => b.peak.ele - a.peak.ele).slice(0, 25).map((i) => `${i.peak.name} ${Math.round(i.dist / 1000)}km`);
  console.log(`::notice title=livelli::Profilo ${prof}: L1 ${t[0].length}, L2 ${t[1].length}, L3 ${t[2].length}. L1: ${t1.join('; ')}`);
  if (h.ground < 150 || h.ground > 500 || monviso < 3300) {
    console.log('::error title=terreno::valori fuori scala');
    process.exit(1);
  }
}
main().catch((e) => {
  console.log(`::error title=terreno::${e?.stack ?? e}`.replace(/\n/g, '%0A'));
  process.exit(1);
});
