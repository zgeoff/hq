export const RETRY_WINDOW_MS = 10 * 60_000;
export const MAX_RETRIES = 2;

export interface MergedRetryFacts {
  mergedAtMs: number;
  nowMs: number;
  retries: number;
  // The last claim has no result yet, so a pass is still wrapping the run up.
  claimOpen: boolean;
  // The sessions the last result kept.
  kept: readonly { id: string; retry?: true | undefined }[];
}

// The sessions to wrap up again, or null when the run gets no retry: only a session kept for a
// failure a later check can clear, only soon after the merge, and only a few times.
export function pickMergedRetry(facts: MergedRetryFacts): string[] | null {
  if (facts.claimOpen || facts.retries >= MAX_RETRIES || facts.nowMs - facts.mergedAtMs >= RETRY_WINDOW_MS) {
    return null;
  }
  const sessions = facts.kept.filter((session) => session.retry === true).map((session) => session.id);
  return sessions.length > 0 ? sessions : null;
}
