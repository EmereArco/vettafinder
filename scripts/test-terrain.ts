// Test eseguito in CI: scarica il terreno attorno a Torino e verifica che i numeri tornino.
import { computeHorizon, elevationAt, isPeakVisible } from '../src/lib/terrain';
import { BASE_PEAKS } from '../src/data/peaks';
import { bearing, distance, elevationAngle } from '../src/lib/geo';

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
  if (h.ground < 150 || h.ground > 500 || monviso < 3300) {
    console.log('::error title=terreno::valori fuori scala');
    process.exit(1);
  }
}
main().catch((e) => {
  console.log(`::error title=terreno::${e?.stack ?? e}`.replace(/\n/g, '%0A'));
  process.exit(1);
});
