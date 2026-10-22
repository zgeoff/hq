import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import type { HealthSettings } from './health-defaults.ts';
import { HEALTH_DEFAULTS } from './health-defaults.ts';

export function healthSettings(db: Database): HealthSettings {
  return { ...HEALTH_DEFAULTS, ...(metaJson(db, 'health_settings', z.record(z.string(), z.unknown()), {}) as Partial<HealthSettings>) };
}
