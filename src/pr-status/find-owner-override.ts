import type { Database } from 'bun:sqlite';
import { readOwnerOverrides } from './read-owner-overrides.ts';
import type { OwnerOverride } from './read-owner-overrides.ts';

export function findOwnerOverride(db: Database, repo: string, pr: number, head: string): OwnerOverride | null {
  return readOwnerOverrides(db, repo, pr).findLast((override) => override.head === head) ?? null;
}
