import type { MoveFacts } from '../src/noslop/mechanical-types.ts';

interface StubMoveFacts {
  base?: [string, string | null][];
  head?: [string, string | null][];
  renames?: string[];
}

// What git says about the paths of a moved-target claim: the tree entry of each path at the merge
// base and at the head (null for an absent path), and the renames in the base branch history as
// keys. A bare object id stands for a regular file's entry; a value with a space is a whole entry.
export function buildStubMoveFacts(facts: StubMoveFacts): MoveFacts {
  return { baseBlobs: buildEntries(facts.base), headBlobs: buildEntries(facts.head), renames: new Set(facts.renames) };
}

function buildEntries(paths: [string, string | null][] | undefined): Map<string, string | null> {
  return new Map((paths ?? []).map(([path, value]) => [path, value === null || value.includes(' ') ? value : `100644 blob ${value}`]));
}
