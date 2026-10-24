import { iso } from '../clock/iso.ts';

export type LimitProjection = { kind: 'reached' } | { kind: 'flat' } | { kind: 'in'; hours: number; at: string };

export interface LimitReading {
  percent: number;
  at: Date;
}

const HOUR_MS = 3_600_000;

export function buildLimitProjection(reading: LimitReading, ratePerHour: number, limit: number, now: Date): LimitProjection {
  if (reading.percent >= limit) {
    return { kind: 'reached' };
  }
  if (ratePerHour <= 0) {
    return { kind: 'flat' };
  }
  const reachMs = reading.at.getTime() + ((limit - reading.percent) / ratePerHour) * HOUR_MS;
  return { kind: 'in', hours: Math.max(0, (reachMs - now.getTime()) / HOUR_MS), at: iso(new Date(reachMs)) };
}
