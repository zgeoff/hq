import type { Database } from 'bun:sqlite';
import { CompiledQuery } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { runSyncRow } from '../db/run-sync-row.ts';

// Reads raw SQL for a test that asserts on stored rows, and parses each row through the schema.
export function queryRows<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema>[] {
  return runSyncQuery(db, CompiledQuery.raw(sql, bindings), schema);
}

// The first column of every row.
export function queryColumn<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema>[] {
  return queryRows(db, sql, z.record(z.string(), z.unknown()), ...bindings).map((row) => schema.parse(Object.values(row)[0]));
}

// The first column of the first row; a test that calls it expects one.
export function queryValue<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema> {
  const [value] = queryColumn(db, sql, schema, ...bindings);
  invariant(value !== undefined, 'the query returned no row');
  return value;
}

// The first row, or null when the query returns none.
export function findRow<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema> | null {
  return runSyncRow(db, CompiledQuery.raw(sql, bindings), schema);
}

// The first row; a test that calls it expects one.
export function queryRow<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema> {
  const row = findRow(db, sql, schema, ...bindings);
  invariant(row, 'the query returned no row');
  return row;
}
