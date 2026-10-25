import type { Database } from 'bun:sqlite';
import { readCIOverrides } from './read-ci-overrides.ts';
import type { CIOverride } from './read-ci-overrides.ts';

// The owner's CI overrides that stand at the head: the full sha must match, and the newest record
// of a check wins.
export function readHeadCIOverrides(db: Database, repo: string, pr: number, head: string): CIOverride[] {
  const atHead = readCIOverrides(db, repo, pr).filter((override) => override.head === head);
  const newest = new Map<string, CIOverride>();
  for (const override of atHead) {
    newest.set(override.check, override);
  }
  return [...newest.values()];
}
