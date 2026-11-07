import type { Database } from 'bun:sqlite';
import type { CompiledQuery } from 'kysely';
import type { z } from 'zod';
import { BindingsSchema } from './bindings-schema.ts';

// The first row of the result, or null when there is none.
export function runSyncRow<Schema extends z.ZodType>(db: Database, query: CompiledQuery, schema: Schema): z.output<Schema> | null {
  return schema.nullable().parse(db.query(query.sql).get(...BindingsSchema.parse(query.parameters)));
}
