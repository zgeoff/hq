export const STALE_LIMITS = {
  staleMs: 2 * 3_600_000,
  saveTimeoutMs: 10 * 60_000,
  backoffMs: 3_600_000,
  backoffMaxMs: 4 * 3_600_000,
  reportAfterSkips: 6,
  activityWindowMs: 2 * 60_000,
  scheduleAgeMs: 6 * 3_600_000,
  scheduleCompactions: 3,
} as const;
