import { iso } from '../clock/iso.ts';

export type LimitProjection = { kind: 'reached' } | { kind: 'flat' } | { kind: 'in'; hours: number; at: string };

// When a window at `latest` percent and a burn of `ratePerHour` reaches `limit` percent.
export function buildLimitProjection(latest: number, ratePerHour: number, limit: number, from: Date): LimitProjection {
  if (latest >= limit) {
    return { kind: 'reached' };
  }
  if (ratePerHour <= 0) {
    return { kind: 'flat' };
  }
  const hours = (limit - latest) / ratePerHour;
  return { kind: 'in', hours, at: iso(new Date(from.getTime() + hours * 3_600_000)) };
}
