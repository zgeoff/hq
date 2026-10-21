import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { FLEET_LAST_SCHEMA } from './fleet-last-schema.ts';
import type { EnsureStep } from './types.ts';

export function loadFleetLast(db: Database): { at: string; dryRun: boolean; steps: EnsureStep[] } | null {
  return metaJson(db, 'fleet_last', FLEET_LAST_SCHEMA.nullable(), null);
}
