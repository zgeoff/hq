import { MAX_MERGED_RETRIES } from './constants.ts';
import type { WrapUp } from './types.ts';

// A retry that forgets a session changes the outcome; otherwise only the last retry posts, so a
// session the retries keep gives one line, not one per attempt.
export function shouldPostRetryNews(wrapUp: WrapUp, attempt: number): boolean {
  return wrapUp.forgotten.length > 0 || wrapUp.failed.length > 0 || attempt >= MAX_MERGED_RETRIES || !wrapUp.kept.some((session) => session.retry === true);
}
