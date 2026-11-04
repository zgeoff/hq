import type { Database } from 'bun:sqlite';
import { writeAreaLabels } from '../src/focus/write-area-labels.ts';

export function seedAreaLabels(db: Database, names: string[], repoExists: Record<string, boolean> = {}): void {
  writeAreaLabels(db, { at: '2026-10-15T19:00:00Z', names, repoExists });
}
