import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const rowSchema = z.object({ user_version: z.number() });

export function userVersion(db: Database): number {
  return rowSchema.parse(db.query('PRAGMA user_version').get()).user_version;
}
