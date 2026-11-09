import type { WrapUp } from './types.ts';

const MAX_RETRIES = 2;

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
  if (facts.claimOpen || facts.retries >= MAX_RETRIES || !isWithinWindow(facts.mergedAtMs, facts.nowMs)) {
    return null;
  }
  const sessions = facts.kept.filter((session) => session.retry === true).map((session) => session.id);
  return sessions.length > 0 ? sessions : null;
}

export const RETRY_WINDOW_MS = 10 * 60_000;

function isWithinWindow(mergedAtMs: number | null, nowMs: number): boolean {
  return mergedAtMs !== null && Number.isFinite(mergedAtMs) && nowMs - mergedAtMs < RETRY_WINDOW_MS;
}

// A retry that forgets a session changes the outcome; otherwise only the last retry posts, so a
// session the retries keep gives one line, not one per attempt.
export function shouldPostRetryNews(wrapUp: WrapUp, attempt: number): boolean {
  return wrapUp.forgotten.length > 0 || wrapUp.failed.length > 0 || attempt >= MAX_RETRIES || !wrapUp.kept.some((session) => session.retry === true);
}
