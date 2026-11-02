import { STALE_LIMITS } from './stale-limits.ts';

export function pickScheduledReason(ageMs: number, compactions: number | null): string | null {
  if (ageMs >= STALE_LIMITS.scheduleAgeMs) {
    return `${STALE_LIMITS.scheduleAgeMs / 3_600_000} h since start`;
  }
  if (compactions !== null && compactions >= STALE_LIMITS.scheduleCompactions) {
    return `${STALE_LIMITS.scheduleCompactions} compactions since start`;
  }
  return null;
}
