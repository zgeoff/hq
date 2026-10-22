import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { strMap } from '../db/str-map.ts';

// A retired session's messages go to the one that took over its work (z-refine → z-triage).
export function loadForwards(db: Database): Record<string, string> {
  return metaJson(db, 'outbox_forwards', strMap, {});
}
