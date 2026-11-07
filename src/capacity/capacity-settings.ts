import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { CAPACITY_DEFAULTS } from './capacity-defaults.ts';
import type { CapacitySettings } from './types.ts';

const StoredSettingsSchema = z.record(z.string(), z.unknown());

export function capacitySettings(db: Database): CapacitySettings {
  return { ...CAPACITY_DEFAULTS, ...collectNumericSettings(metaJson(db, 'capacity_settings', StoredSettingsSchema, {})) };
}

const SETTING_KEYS = ['nonnixMaxMib', 'nonnixMaxVcpus', 'impVcpus', 'cloudMinAvailGiB', 'claudeSevenDayPct', 'claudeFiveHourPct', 'opDailyPct', 'holdSamples'] as const satisfies readonly (keyof CapacitySettings)[];

function collectNumericSettings(stored: Record<string, unknown>): Partial<CapacitySettings> {
  return Object.fromEntries(
    SETTING_KEYS.flatMap((key) => {
      const value = stored[key];
      return typeof value === 'number' ? [[key, value]] : [];
    }),
  );
}
