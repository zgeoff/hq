import { getSydneyParts } from '../../clock/get-sydney-parts.ts';
import type { BurnPoint } from '../build-burn-rate.ts';
import { buildBurnRate } from '../build-burn-rate.ts';
import { buildHourProfile } from './build-hour-profile.ts';

const RECENT_MS = 2 * 3_600_000;
const NEAR_MS = 2 * 3_600_000;

export interface BlendedProfile {
  rateAt: (time: Date) => number;
}

export function buildBlendedProfile(active: readonly BurnPoint[], history: readonly (readonly BurnPoint[])[], at: Date, scaleAt: (time: string) => number): BlendedProfile | null {
  const recentPoints = active.filter((point) => at.getTime() - Date.parse(point.at) <= RECENT_MS);
  const recent = buildBurnRate(buildScaledPoints(recentPoints, scaleAt)).ratePerHour;
  const hourly = buildHourProfile(history, scaleAt);
  const near = buildFilledRates(hourly.map((rate) => blend(recent, rate)));
  const far = buildFilledRates(hourly.map((rate) => rate ?? recent));
  if (near === null || far === null) {
    return null;
  }
  return {
    rateAt: (time) => {
      const rates = time.getTime() - at.getTime() < NEAR_MS ? near : far;
      return rates[getSydneyParts(time).hour] ?? 0;
    },
  };
}

function buildScaledPoints(points: readonly BurnPoint[], scaleAt: (time: string) => number): BurnPoint[] {
  const since = buildBurnRate(points).since;
  const kept = points.filter((point) => point.percent !== null && since !== null && Date.parse(point.at) >= Date.parse(since));
  let total = kept[0]?.percent ?? 0;
  return kept.map((point, index) => {
    const previous = kept[index - 1];
    if (previous !== undefined) {
      total += ((point.percent ?? 0) - (previous.percent ?? 0)) * scaleAt(previous.at);
    }
    return { at: point.at, percent: total, resetsAt: null };
  });
}

function buildFilledRates(rates: readonly (number | null)[]): number[] | null {
  const known = rates.filter((rate) => rate !== null);
  if (known.length === 0) {
    return null;
  }
  const mean = known.reduce((sum, rate) => sum + rate, 0) / known.length;
  return rates.map((rate) => Math.max(0, rate ?? mean));
}

function blend(recent: number | null, hourly: number | null): number | null {
  if (recent !== null && hourly !== null) {
    return (recent + hourly) / 2;
  }
  return recent ?? hourly;
}
