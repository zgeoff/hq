import type { Database } from 'bun:sqlite';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely } from 'kysely';
import type { HqTables } from './db/hq-columns.ts';

export type CapacitySampleRow = HqTables['capacity_samples'];
export type PRStatusRow = HqTables['pr_status'];
export type ShippedCacheRow = HqTables['shipped_cache'];

// hq owns the Database: destroying the Kysely instance leaves it open.
export function kdb(db: Database): Kysely<HqTables> {
  return new Kysely<HqTables>({ dialect: buildSQLiteDialect(db) });
}
