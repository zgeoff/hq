import type { Database } from 'bun:sqlite';
import { CompiledQuery } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { runSyncRow } from '../db/run-sync-row.ts';

export function queryRows<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema>[] {
  return runSyncQuery(db, CompiledQuery.raw(sql, bindings), schema);
}

export function queryColumn<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema>[] {
  return queryRows(db, sql, z.record(z.string(), z.unknown()), ...bindings).map((row) => schema.parse(Object.values(row)[0]));
}

export function queryValue<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema> {
  const [value] = queryColumn(db, sql, schema, ...bindings);
  invariant(value !== undefined, 'the query returned no row');
  return value;
}

export function readRow<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema> | null {
  return runSyncRow(db, CompiledQuery.raw(sql, bindings), schema);
}

export function queryRow<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema> {
  const row = readRow(db, sql, schema, ...bindings);
  invariant(row, 'the query returned no row');
  return row;
}
