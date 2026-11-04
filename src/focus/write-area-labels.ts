import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import { AREA_LABELS_KEY } from './area-labels-schema.ts';
import type { StoredAreaLabels } from './area-labels-schema.ts';

export function writeAreaLabels(db: Database, labels: StoredAreaLabels): void {
  setMeta(db, AREA_LABELS_KEY, JSON.stringify(labels));
}
