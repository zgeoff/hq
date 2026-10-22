import type { Database } from 'bun:sqlite';
import type { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { OPEN_ALERTS_SCHEMA as OPEN } from './open-alerts-schema.ts';

export function openAlerts(db: Database): z.infer<typeof OPEN> {
  return metaJson(db, 'capacity_open', OPEN, {});
}
