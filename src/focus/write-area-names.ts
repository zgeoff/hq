import type { Database } from 'bun:sqlite';
import { readAreaLabels } from './read-area-labels.ts';
import { writeAreaLabels } from './write-area-labels.ts';

// A read that checks no repo keeps what an earlier check found for the labels still there.
export function writeAreaNames(db: Database, names: readonly string[], at: string): void {
  const kept = Object.entries(readAreaLabels(db).repoExists).filter(([name]) => names.includes(name));
  writeAreaLabels(db, { at, names: [...names], repoExists: Object.fromEntries(kept) });
}
