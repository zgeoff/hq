import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import type { HealthSettings } from './health-defaults.ts';
import { HEALTH_DEFAULTS } from './health-defaults.ts';

const StoredSettingsSchema = z.record(z.string(), z.unknown());

export function healthSettings(db: Database): HealthSettings {
  const stored = metaJson(db, 'health_settings', StoredSettingsSchema, {});
  return pickHealthSettings(stored);
}

// A stored value of the wrong type falls back to its default, and a key that is no setting is dropped.
function pickHealthSettings(stored: Record<string, unknown>): HealthSettings {
  return {
    diskMinPct: pickNumber(stored['diskMinPct'], HEALTH_DEFAULTS.diskMinPct),
    diskMinGiB: pickNumber(stored['diskMinGiB'], HEALTH_DEFAULTS.diskMinGiB),
    memSomeAvg60: pickNumber(stored['memSomeAvg60'], HEALTH_DEFAULTS.memSomeAvg60),
    memAvailMinPct: pickNumber(stored['memAvailMinPct'], HEALTH_DEFAULTS.memAvailMinPct),
    restarts: pickNumber(stored['restarts'], HEALTH_DEFAULTS.restarts),
    restartWindowMin: pickNumber(stored['restartWindowMin'], HEALTH_DEFAULTS.restartWindowMin),
    backupMaxAgeHours: pickNumber(stored['backupMaxAgeHours'], HEALTH_DEFAULTS.backupMaxAgeHours),
    ignoreUnits: typeof stored['ignoreUnits'] === 'string' ? stored['ignoreUnits'] : HEALTH_DEFAULTS.ignoreUnits,
  };
}

function pickNumber(stored: unknown, fallback: number): number {
  return typeof stored === 'number' ? stored : fallback;
}
