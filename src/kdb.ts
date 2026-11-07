import type { Database } from 'bun:sqlite';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely } from 'kysely';
import type { HQ_COLUMNS } from './db/hq-columns.ts';

export type ColumnSpec = 'integer' | 'integer?' | 'real' | 'real?' | 'text' | 'text?' | { readonly values: readonly string[]; readonly nullable: boolean };

type ColumnType<Spec extends ColumnSpec> = Spec extends 'text'
  ? string
  : Spec extends 'text?'
    ? string | null
    : Spec extends 'integer' | 'real'
      ? number
      : Spec extends 'integer?' | 'real?'
        ? number | null
        : Spec extends { readonly values: infer Values extends readonly string[]; readonly nullable: infer Nullable }
          ? Nullable extends true
            ? Values[number] | null
            : Values[number]
          : never;

type RowOf<Columns> = { -readonly [Column in keyof Columns]: Columns[Column] extends ColumnSpec ? ColumnType<Columns[Column]> : never };

export type HqTables = { [Table in keyof typeof HQ_COLUMNS]: RowOf<(typeof HQ_COLUMNS)[Table]> };

export type CapacitySampleRow = HqTables['capacity_samples'];
export type PRStatusRow = HqTables['pr_status'];
export type ShippedCacheRow = HqTables['shipped_cache'];

// hq owns the Database: destroying the Kysely instance leaves it open.
export function kdb(db: Database): Kysely<HqTables> {
  return new Kysely<HqTables>({ dialect: buildSQLiteDialect(db) });
}
