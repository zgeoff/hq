import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { DEFAULT_FLEET_MODEL, FLEET_MODEL_KEY, fleetModelSchema } from './fleet-model-schema.ts';
import type { FleetModel } from './types.ts';

export function readFleetModel(db: Database): FleetModel {
  const stored = metaJson(db, FLEET_MODEL_KEY, fleetModelSchema.nullable(), null);
  return stored === null ? { model: DEFAULT_FLEET_MODEL, source: 'default' } : { model: stored.model, source: 'set', setAt: stored.setAt, setBy: stored.setBy };
}
