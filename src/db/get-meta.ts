import type { Database } from 'bun:sqlite';
import { kdb } from '../kdb.ts';
import { buildRowSchema } from './build-row-schema.ts';
import { runSyncRow } from './run-sync-row.ts';

const MetaValueSchema = buildRowSchema('meta').pick({ value: true });

export function getMeta(db: Database, key: string): string | null {
  return runSyncRow(db, kdb(db).selectFrom('meta').select('value').where('key', '=', key).compile(), MetaValueSchema)?.value ?? null;
}
