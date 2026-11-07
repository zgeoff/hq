import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';
import { TypedRowSchema } from './typed-row-schema.ts';
import type { Typed } from './types.ts';

export function listTyped(db: Database, opts: { session: string | null; limit: number }): Typed[] {
  if (!Number.isInteger(opts.limit) || opts.limit < 1) throw new HqError('bad_args', '--limit must be 1 or more');
  if (!opts.session) return runSyncQuery(db, kdb(db).selectFrom('typed').selectAll().orderBy('id', 'desc').limit(opts.limit).compile(), TypedRowSchema);
  const s = opts.session.toLowerCase();
  const p = /^[0-9a-f-]{4,}$/.test(s) ? s : '\u0000';
  const query = sql`SELECT * FROM typed WHERE lower(to_session) = ${s} OR lower(to_name) = ${s} OR to_id LIKE ${p} || '%' OR lower(to_session) LIKE ${p} || '%' ORDER BY id DESC LIMIT ${opts.limit}`.compile(kdb(db));
  return runSyncQuery(db, query, TypedRowSchema);
}
