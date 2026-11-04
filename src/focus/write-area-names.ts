import type { Database } from 'bun:sqlite';
import { buildAreaLabels } from './build-area-labels.ts';
import { readAreaLabels } from './read-area-labels.ts';
import { writeAreaLabels } from './write-area-labels.ts';

export function writeAreaNames(db: Database, names: readonly string[], at: string): void {
  writeAreaLabels(db, buildAreaLabels(readAreaLabels(db), names, at));
}
