import type { Database } from 'bun:sqlite';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { BindingsSchema } from '../db/bindings-schema.ts';

// Reads raw SQL for a test that asserts on stored rows, and parses each row through the schema.
export function queryRows<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema>[] {
  return z.array(schema).parse(db.query(sql).all(...BindingsSchema.parse(bindings)));
}

// The first row, or null when the query returns none.
export function findRow<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema> | null {
  return schema.nullable().parse(db.query(sql).get(...BindingsSchema.parse(bindings)));
}

// The first row; a test that calls it expects one.
export function queryRow<Schema extends z.ZodType>(db: Database, sql: string, schema: Schema, ...bindings: (string | number | null)[]): z.output<Schema> {
  const row = findRow(db, sql, schema, ...bindings);
  invariant(row, 'the query returned no row');
  return row;
}
