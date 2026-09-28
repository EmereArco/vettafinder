import type { PeakInfo } from '../state/AppState';

export type Tier = 1 | 2 | 3;
export type ProfileKey = 'montagna' | 'valle' | 'pianura';

/** Soglie di distanza (km) tra livello 1–2 e 2–3 per ogni profilo. */
export const PROFILES: Record<ProfileKey, { label: string; near: number; far: number }> = {
  montagna: { label: 'Montagna', near: 15, far: 50 },
  valle: { label: 'Valle', near: 10, far: 30 },
  pianura: { label: 'Pianura', near: 25, far: 80 },
};
export const PROFILE_ORDER: ProfileKey[] = ['montagna', 'valle', 'pianura'];

/** Profilo suggerito in base alla quota del punto di osservazione. */
export function autoProfile(eyeAlt: number | null | undefined): ProfileKey {
  if (eyeAlt == null) return 'montagna';
  if (eyeAlt < 600) return 'pianura';
  if (eyeAlt < 1500) return 'valle';
  return 'montagna';
}

/** Livello 1: vicine o prominenti · Livello 2: media distanza · Livello 3: lontane. */
export function tierOf(i: PeakInfo, profile: ProfileKey): Tier {
  const p = PROFILES[profile];
  if (i.dist < p.near * 1000 || i.peak.major) return 1;
  if (i.dist < p.far * 1000) return 2;
  return 3;
}

export const TIER_STYLE: Record<Tier, { fontSize: number; bold: boolean; color: string; opacity: number; bg: number }> = {
  1: { fontSize: 13, bold: true, color: '#FFFFFF', opacity: 1, bg: 0.78 },
  2: { fontSize: 11, bold: false, color: '#D6E2EE', opacity: 0.95, bg: 0.6 },
  3: { fontSize: 10, bold: false, color: '#B7C6D6', opacity: 0.6, bg: 0.4 },
};

export const TIER_LABEL: Record<Tier, string> = { 1: 'Vicine e principali', 2: 'Medie', 3: 'Lontane' };
