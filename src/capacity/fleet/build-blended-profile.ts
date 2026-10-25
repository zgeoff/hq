import type { BurnPoint } from '../build-burn-rate.ts';
import { buildBurnRate } from '../build-burn-rate.ts';
import { buildHourProfile } from './build-hour-profile.ts';

const RECENT_MS = 2 * 3_600_000;

export function buildBlendedProfile(active: readonly BurnPoint[], history: readonly (readonly BurnPoint[])[], at: Date): number[] | null {
  const recent = buildBurnRate(active.filter((point) => at.getTime() - Date.parse(point.at) <= RECENT_MS)).ratePerHour;
  const hourly = buildHourProfile(history);
  const blended = hourly.map((rate) => blend(recent, rate));
  const known = blended.filter((rate) => rate !== null);
  if (known.length === 0) {
    return null;
  }
  const mean = known.reduce((sum, rate) => sum + rate, 0) / known.length;
  return blended.map((rate) => Math.max(0, rate ?? mean));
}

function blend(recent: number | null, hourly: number | null): number | null {
  if (recent !== null && hourly !== null) {
    return (recent + hourly) / 2;
  }
  return recent ?? hourly;
}
