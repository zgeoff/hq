import { pickRunSession } from './pick-run-session.ts';

interface OwnedPrState {
  session_id: string | null;
  session_by_hand: number;
}

export interface OwnedPrInput {
  existing: OwnedPrState | null;
  sessionIDs: readonly string[];
  given: string;
}

export type OwnedPrWrites = { kind: 'no-session' } | { kind: 'write'; attached: boolean; owner: string; previousOwner: string | null; ownerChanged: boolean };

// A PR already on the run keeps its attachment and takes the new owner. A PR the same session
// already owns by hand needs no write.
export function pickOwnedPrWrites(input: OwnedPrInput): OwnedPrWrites {
  const owner = pickRunSession(input.sessionIDs, input.given);
  if (owner === null) {
    return { kind: 'no-session' };
  }
  const previousOwner = input.existing?.session_id ?? null;
  const isSameHandOwner = previousOwner === owner && input.existing?.session_by_hand === 1;
  return { kind: 'write', attached: input.existing === null, owner, previousOwner, ownerChanged: !isSameHandOwner };
}
