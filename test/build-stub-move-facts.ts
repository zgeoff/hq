import type { MoveFacts } from '../src/noslop/types.ts';

interface StubMoveFacts {
  base?: [string, string | null][];
  head?: [string, string | null][];
  renames?: string[];
}

export function buildStubMoveFacts(facts: StubMoveFacts): MoveFacts {
  return { baseBlobs: buildEntries(facts.base), headBlobs: buildEntries(facts.head), renames: new Set(facts.renames) };
}

function buildEntries(paths: [string, string | null][] | undefined): Map<string, string | null> {
  return new Map((paths ?? []).map(([path, value]) => [path, value === null || value.includes(' ') ? value : `100644 blob ${value}`]));
}
