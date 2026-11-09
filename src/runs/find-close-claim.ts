import { z } from 'zod';
import type { StoredEvent } from '../read-events.ts';
import { isCleanupHeld } from './is-cleanup-held.ts';
import type { ClaimedSession } from './pick-sessions-to-close.ts';

export interface CloseClaim {
  seq: number;
  issue: string;
  sessions: ClaimedSession[];
}

export interface CloseClaimFacts {
  issue: string;
  state: string | null;
  events: readonly StoredEvent[];
  at: Date;
  ownSeqs: ReadonlySet<number>;
}

export const CLOSE_CLAIM_EVENTS = ['design-done-close', 'design-done-close-result', 'state', 'reopen', 'design-to-build'] as const;

const CLAIM_ENDS = new Set(['design-done-close-result', 'state', 'reopen', 'design-to-build']);

// A claim another pass holds is left to it until it goes stale; a claim the run has moved on from,
// by its result, a reopen, a state change or a move to the build run, is void.
export function findCloseClaim(facts: CloseClaimFacts): CloseClaim | null {
  const claimed = facts.events.findLastIndex((event) => event.action === 'design-done-close');
  const claim = facts.events[claimed];
  if (claim === undefined || facts.state !== 'done' || facts.events.slice(claimed + 1).some((event) => CLAIM_ENDS.has(event.action))) {
    return null;
  }
  if (!facts.ownSeqs.has(claim.seq) && isCleanupHeld(facts.events, facts.at)) {
    return null;
  }
  return { seq: claim.seq, issue: facts.issue, sessions: parseClaimSessions(claim.data) };
}

const ClaimDataSchema = z.object({ sessions: z.array(z.object({ id: z.string(), active: z.boolean() })) });

function parseClaimSessions(data: string): ClaimedSession[] {
  const parsed: unknown = JSON.parse(data);
  return ClaimDataSchema.parse(parsed).sessions;
}
