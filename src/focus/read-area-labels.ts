import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { AREA_LABELS_KEY, areaLabelsSchema } from './area-labels-schema.ts';
import type { AreaLabels } from './area-labels-schema.ts';
import { FOCUS_AREAS } from './focus-areas.ts';

// Until a read of Linear's labels is stored, the built-in list stands in for it.
export function readAreaLabels(db: Database): AreaLabels {
  const stored = metaJson(db, AREA_LABELS_KEY, areaLabelsSchema.nullable(), null);
  return stored ?? { at: null, names: [...FOCUS_AREAS], repoExists: {} };
}
