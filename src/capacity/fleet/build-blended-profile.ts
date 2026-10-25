import type { BurnPoint } from '../build-burn-rate.ts';
import { buildBurnRate } from '../build-burn-rate.ts';
import { buildHourProfile } from './build-hour-profile.ts';

const RECENT_MS = 2 * 3_600_000;

// The burn in points per hour for each Sydney hour of the day: half the slope of the last 2 hours
// and half the mean of that hour over the points given, or whichever of the two exists. An hour
// with neither takes the mean of the others. Null when nothing gives a rate.
export function buildBlendedProfile(points: readonly BurnPoint[], at: Date): number[] | null {
  const recent = buildBurnRate(points.filter((point) => at.getTime() - Date.parse(point.at) <= RECENT_MS)).ratePerHour;
  const hourly = buildHourProfile(points);
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
