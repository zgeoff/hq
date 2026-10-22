import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { BLOB } from './blob.ts';
import { CAPACITY_DEFAULTS } from './capacity-defaults.ts';
import type { CapacitySettings } from './types.ts';

export function capacitySettings(db: Database): CapacitySettings {
  return { ...CAPACITY_DEFAULTS, ...(metaJson(db, 'capacity_settings', BLOB, {}) as Partial<CapacitySettings>) };
}
