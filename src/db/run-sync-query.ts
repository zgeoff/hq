import type { Database } from 'bun:sqlite';
import type { CompiledQuery } from 'kysely';
import { z } from 'zod';
import { BindingsSchema } from './bindings-schema.ts';

// Kysely's execute is async and waits on its own connection lock, so a sync read compiles the query
// and runs it on the Database, where a caller's bun:sqlite transaction holds it.
export function runSyncQuery<Schema extends z.ZodType>(db: Database, query: CompiledQuery, schema: Schema): z.output<Schema>[] {
  return z.array(schema).parse(db.query(query.sql).all(...BindingsSchema.parse(query.parameters)));
}
