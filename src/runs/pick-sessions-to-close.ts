import type { WrapUp } from './types.ts';

export interface ClaimedSession {
  id: string;
  active: boolean;
}

export type SessionToClose = { session: string; why: 'pinned' } | { session: string; why: 'failed'; reason: string };

// A wrap-up that failed as a whole names the run, not a session, so each session still active at
// the close stays on the list. A failure on a session the run had already ended is dropped; one on a
// session the run never held, such as a sub-session, stays.
export function pickSessionsToClose(wrapUp: WrapUp, issue: string, claimed: readonly ClaimedSession[]): SessionToClose[] {
  const picked = new Map<string, SessionToClose>();
  for (const kept of wrapUp.kept) {
    if (kept.reason === 'pinned in atc') {
      picked.set(kept.id, { session: kept.id, why: 'pinned' });
    }
  }
  for (const failure of wrapUp.failed) {
    const sessions = failure.id === issue ? claimed.filter((session) => session.active).map((session) => session.id) : [failure.id].filter((id) => !isEndedSession(claimed, id));
    for (const session of sessions) {
      if (!picked.has(session)) {
        picked.set(session, { session, why: 'failed', reason: failure.reason });
      }
    }
  }
  return [...picked.values()];
}

// A stored id can be a short prefix of the full id atc reports.
function isEndedSession(claimed: readonly ClaimedSession[], id: string): boolean {
  const lower = id.toLowerCase();
  return claimed.some((session) => !session.active && (lower.startsWith(session.id.toLowerCase()) || session.id.toLowerCase().startsWith(lower)));
}
