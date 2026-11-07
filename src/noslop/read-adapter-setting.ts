import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';

export const ADAPTER_KEY = 'noslop_adapter';

const AdapterSettingSchema = z.object({ adapter: z.enum(['codex', 'claude']), until: z.string(), by: z.string() }).nullable();

export type AdapterSetting = z.output<typeof AdapterSettingSchema>;

export function readAdapterSetting(db: Database): AdapterSetting {
  return metaJson(db, ADAPTER_KEY, AdapterSettingSchema, null);
}
