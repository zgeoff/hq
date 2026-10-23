import type { MoveFacts } from '../src/noslop/mechanical-types.ts';

interface StubMoveFacts {
  base?: [string, string | null][];
  head?: [string, string | null][];
  renames?: string[];
}

// What git says about the paths of a moved-target claim: the blob of each path at the merge base and
// at the head (null for an absent path), and the renames in the base branch history as keys.
export function buildStubMoveFacts(facts: StubMoveFacts): MoveFacts {
  return { baseBlobs: new Map(facts.base), headBlobs: new Map(facts.head), renames: new Set(facts.renames) };
}
