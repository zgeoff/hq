// The stale restart's waits: how long a prompt reads stale before the ask, how long the ask
// waits for an answer, the first and longest wait after a deferral, the deferrals before z-stu is
// told, and how recently a session must have been quiet. A scheduled restart is due 6 h after a
// session's start, or after 3 compactions since it.
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
