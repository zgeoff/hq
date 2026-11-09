import type { WrapUp } from './types.ts';

// A wrap-up that failed as a whole names the run, not a session, so every session of the run stays
// on the list.
export function pickSessionsToClose(wrapUp: WrapUp, issue: string, runSessions: readonly string[]): string[] {
  const pinned = wrapUp.kept.filter((kept) => kept.reason === 'pinned in atc').map((kept) => kept.id);
  const failed = wrapUp.failed.flatMap((failure) => (failure.id === issue ? runSessions : [failure.id]));
  return [...new Set([...pinned, ...failed])];
}
