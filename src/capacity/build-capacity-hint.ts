import { buildBurnRate } from './build-burn-rate.ts';
import type { BurnRate } from './build-burn-rate.ts';
import { buildLimitProjection } from './build-limit-projection.ts';
import type { LimitProjection } from './build-limit-projection.ts';
import type { UsageSample } from './usage-sample.ts';

export interface BurnWindow extends BurnRate {
  window: '7-day' | '5-hour';
  method: 'least-squares';

  atRate: LimitProjection | null;

  atCap: (LimitProjection & { ratePerHour: number }) | null;
}

export interface CapacityHint {
  hours: number;
  limit: number;
  account: string | null;
  working: { average: number; basis: 'current count, no history' };
  cap: number | null;
  windows: BurnWindow[];
}

export interface CapacityHintInput {
  samples: readonly UsageSample[];
  hours: number;
  limit: number;
  working: number;
  cap: number | null;
  at: Date;
}

export function buildCapacityHint(input: CapacityHintInput): CapacityHint {
  const sevenDay = buildWindow(input, '7-day', input.samples.map((sample) => ({ at: sample.at, percent: sample.seven_day, resetsAt: sample.seven_day_resets_at })));
  const fiveHour = buildWindow(input, '5-hour', input.samples.map((sample) => ({ at: sample.at, percent: sample.five_hour, resetsAt: sample.five_hour_resets_at })));
  return { hours: input.hours, limit: input.limit, account: input.samples.at(-1)?.account ?? null, working: { average: input.working, basis: 'current count, no history' }, cap: input.cap, windows: [sevenDay, fiveHour] };
}

function buildWindow(input: CapacityHintInput, window: BurnWindow['window'], points: Parameters<typeof buildBurnRate>[0]): BurnWindow {
  const burn = buildBurnRate(points);
  const base = { ...burn, window, method: 'least-squares' as const };
  if (burn.latest === null || burn.ratePerHour === null) {
    return { ...base, atRate: null, atCap: null };
  }
  const atRate = buildLimitProjection(burn.latest, burn.ratePerHour, input.limit, input.at);
  if (input.cap === null || input.working === 0) {
    return { ...base, atRate, atCap: null };
  }
  const capRate = (burn.ratePerHour / input.working) * input.cap;
  return { ...base, atRate, atCap: { ...buildLimitProjection(burn.latest, capRate, input.limit, input.at), ratePerHour: capRate } };
}
