import type { Database } from 'bun:sqlite';
import { readCIOverrides } from './read-ci-overrides.ts';
import type { CIOverride } from './parse-ci-overrides.ts';

export function readHeadCIOverrides(db: Database, repo: string, pr: number, head: string): CIOverride[] {
  const atHead = readCIOverrides(db, repo, pr).filter((override) => override.head === head);
  const newest = new Map<string, CIOverride>();
  for (const override of atHead) {
    newest.set(override.check, override);
  }
  return [...newest.values()];
}
