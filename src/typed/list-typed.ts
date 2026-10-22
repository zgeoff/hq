import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import type { Typed } from './types.ts';

// Newest first. --session matches the target by name, full id or id prefix; a target atc
// couldn't resolve is matched on the id it was given as.
export function listTyped(db: Database, opts: { session: string | null; limit: number }): Typed[] {
  if (!Number.isInteger(opts.limit) || opts.limit < 1) throw new HqError('bad_args', '--limit must be 1 or more');
  if (!opts.session) return db.query('SELECT * FROM typed ORDER BY id DESC LIMIT ?').all(opts.limit) as Typed[];
  const s = opts.session.toLowerCase();
  return db
    .query(`SELECT * FROM typed WHERE lower(to_session) = $s OR lower(to_name) = $s OR to_id LIKE $p || '%' OR lower(to_session) LIKE $p || '%' ORDER BY id DESC LIMIT $n`)
    .all({ s, p: /^[0-9a-f-]{4,}$/.test(s) ? s : '\u0000', n: opts.limit }) as Typed[];
}
