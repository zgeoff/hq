import type { Database } from 'bun:sqlite';
import { readFinalClaims } from './read-final-claims.ts';
import { readNotePlan } from './read-note-plan.ts';
import type { FeedEvent, FinalClaim, FinalResolutions } from './types.ts';

// Resolves every FINAL claim the page's new notes make, before the transaction that stores them opens.
export function readFeedFinals(db: Database, events: FeedEvent[], resolveFinal: (claims: FinalClaim[]) => Promise<FinalResolutions>): Promise<FinalResolutions> {
  const claims = events.flatMap((event) => {
    if (event.kind !== 'note' || !event.detail) {
      return [];
    }
    const notePlan = readNotePlan(db, event);
    return notePlan.session !== null && notePlan.plan === 'apply' ? readFinalClaims(db, notePlan.session.issue, event.detail) : [];
  });
  return resolveFinal(claims);
}
