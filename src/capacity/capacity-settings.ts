import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { CAPACITY_DEFAULTS } from './capacity-defaults.ts';
import type { CapacitySettings } from './types.ts';

const SETTING_KEYS = ['nonnixMaxMib', 'nonnixMaxVcpus', 'impVcpus', 'cloudMinAvailGiB', 'claudeSevenDayPct', 'claudeFiveHourPct', 'opDailyPct', 'holdSamples'] as const satisfies readonly (keyof CapacitySettings)[];

const SettingsSchema = z.partialRecord(z.enum(SETTING_KEYS), z.number());

export function capacitySettings(db: Database): CapacitySettings {
  return { ...CAPACITY_DEFAULTS, ...metaJson(db, 'capacity_settings', SettingsSchema, {}) };
}
