import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { strMap } from '../db/str-map.ts';

export function loadForwards(db: Database): Record<string, string> {
  return metaJson(db, 'outbox_forwards', strMap, {});
}
