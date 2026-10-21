import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import type { HealthSettings } from './health-defaults.ts';
import { HEALTH_DEFAULTS } from './health-defaults.ts';
import { healthSettings } from './health-settings.ts';

export function setHealthSetting(db: Database, key: string, value: string | null, actor: string): HealthSettings {
  if (!(key in HEALTH_DEFAULTS)) throw new HqError('bad_args', `unknown setting ${key}: one of ${Object.keys(HEALTH_DEFAULTS).join(', ')}`);
  const cur = metaJson(db, 'health_settings', z.record(z.string(), z.unknown()), {});
  if (value === null) delete cur[key];
  else if (key === 'ignoreUnits') cur[key] = value;
  else {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new HqError('bad_args', `${key} must be a number, 0 or more`);
    cur[key] = n;
  }
  setMeta(db, 'health_settings', JSON.stringify(cur));
  logEvent(db, 'hq', 'health', 'setting', actor, null, null, { key, value });
  return healthSettings(db);
}
