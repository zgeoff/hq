import type { Database } from 'bun:sqlite';
import { readOwnerOverrides } from './read-owner-overrides.ts';
import type { OwnerOverride } from './read-owner-overrides.ts';

export function readOwnerOverride(db: Database, repo: string, pr: number): OwnerOverride | null {
  return readOwnerOverrides(db, repo, pr).at(-1) ?? null;
}
