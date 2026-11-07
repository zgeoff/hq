import type { Database } from 'bun:sqlite';
import { isRecord } from '@zgeoff/std';
import { getMeta } from '../db/get-meta.ts';
import { parseJSON } from '../noslop/parse-json.ts';

export function fleetIds(db: Database): Record<string, string> {
  const raw = parseJSON(getMeta(db, 'fleet_ids') ?? '{}');
  if (!isRecord(raw)) {
    return {};
  }
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}
