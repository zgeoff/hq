import { MAX_MERGED_RETRIES, MERGED_RETRY_WINDOW_MS } from './constants.ts';

export interface MergedRetryFacts {
  // Null when the run has no merge on record.
  mergedAtMs: number | null;
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
  if (facts.claimOpen || facts.retries >= MAX_MERGED_RETRIES || !isWithinWindow(facts.mergedAtMs, facts.nowMs)) {
    return null;
  }
  const sessions = facts.kept.filter((session) => session.retry === true).map((session) => session.id);
  return sessions.length > 0 ? sessions : null;
}

function isWithinWindow(mergedAtMs: number | null, nowMs: number): boolean {
  return mergedAtMs !== null && Number.isFinite(mergedAtMs) && nowMs - mergedAtMs < MERGED_RETRY_WINDOW_MS;
}
