export const EARTH_R = 6371000;
const REFRACTION_K = 0.13; // coefficiente di rifrazione atmosferica standard

export const toRad = (d: number) => (d * Math.PI) / 180;
export const toDeg = (r: number) => (r * 180) / Math.PI;

/** Distanza in metri (haversine). */
export function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Azimut iniziale in gradi (0 = Nord, 90 = Est). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Punto a distanza `dist` metri lungo l'azimut `brg`. */
export function destination(lat: number, lon: number, brg: number, dist: number) {
  const δ = dist / EARTH_R;
  const θ = toRad(brg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lon: toDeg(λ2) };
}

/**
 * Angolo di elevazione apparente (gradi) di un punto a quota `hTarget`
 * visto da quota `hObs` a distanza `d`, con curvatura terrestre e rifrazione.
 */
export function elevationAngle(hObs: number, hTarget: number, d: number) {
  if (d < 1) return 0;
  const drop = (d * d * (1 - REFRACTION_K)) / (2 * EARTH_R);
  return toDeg(Math.atan2(hTarget - hObs - drop, d));
}

/** Differenza angolare con segno in [-180, 180). */
export function angleDiff(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

export const norm360 = (a: number) => ((a % 360) + 360) % 360;

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export function cardinal(brg: number) {
  return CARDINALS[Math.round(norm360(brg) / 22.5) % 16];
}

export function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(m / 1000)} km`;
}

export function formatEle(m: number) {
  return `${Math.round(m).toLocaleString('it-IT')} m`;
}

/** Media circolare con filtro passa-basso per la bussola. */
export function smoothAngle(prev: number | null, next: number, alpha = 0.25) {
  if (prev == null) return next;
  return norm360(prev + angleDiff(next, prev) * alpha);
}

export function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
