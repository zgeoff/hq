const DAY_MS = 24 * 60 * 60 * 1000;

// A session's earlier notes count from the run's start, or from 24 hours before now when that is later.
export function pickBackfillStart(runCreatedAt: string, nowMs: number): number {
  return Math.max(Date.parse(runCreatedAt), nowMs - DAY_MS);
}
