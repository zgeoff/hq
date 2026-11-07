import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { getMeta } from '../db/get-meta.ts';

const StoredSchema = z.record(z.string(), z.unknown());

export function loadStoredTargets(db: Database): Record<string, unknown> {
  try {
    const parsed = StoredSchema.safeParse(JSON.parse(getMeta(db, 'goal_targets') ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}
