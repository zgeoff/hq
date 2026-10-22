import { STALE_LIMITS } from './stale-limits.ts';

// Why a scheduled restart is due, or null: 6 h since the session's start, or 3 compactions since
// it. `compactions` is null when the transcript is not read, and then only the age decides.
export function pickScheduledReason(ageMs: number, compactions: number | null): string | null {
  if (ageMs >= STALE_LIMITS.scheduleAgeMs) {
    return `${STALE_LIMITS.scheduleAgeMs / 3_600_000} h since start`;
  }
  if (compactions !== null && compactions >= STALE_LIMITS.scheduleCompactions) {
    return `${STALE_LIMITS.scheduleCompactions} compactions since start`;
  }
  return null;
}
