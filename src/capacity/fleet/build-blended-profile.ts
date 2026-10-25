import { getSydneyParts } from '../../clock/get-sydney-parts.ts';
import type { BurnPoint } from '../build-burn-rate.ts';
import { buildBurnRate } from '../build-burn-rate.ts';
import { buildHourProfile } from './build-hour-profile.ts';

const RECENT_MS = 2 * 3_600_000;
const NEAR_MS = 2 * 3_600_000;

export interface BlendedProfile {
  rateAt: (time: Date) => number;
}

export function buildBlendedProfile(active: readonly BurnPoint[], history: readonly (readonly BurnPoint[])[], at: Date): BlendedProfile | null {
  const recent = buildBurnRate(active.filter((point) => at.getTime() - Date.parse(point.at) <= RECENT_MS)).ratePerHour;
  const hourly = buildHourProfile(history);
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
