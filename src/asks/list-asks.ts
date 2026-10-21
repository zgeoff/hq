import type { Database } from 'bun:sqlite';
import type { AskState } from '../transitions/ask-states.ts';
import { parseAskRow as hydrate } from './parse-ask-row.ts';
import type { Ask, Kind, Row } from './types.ts';

export function listAsks(db: Database, opts: { kind?: Kind; states?: AskState[] } = {}): Ask[] {
  const where: string[] = [];
  const args: string[] = [];
  if (opts.kind) {
    where.push('kind = ?');
    args.push(opts.kind);
  }
  if (opts.states?.length) {
    where.push(`state IN (${opts.states.map(() => '?').join(',')})`);
    args.push(...opts.states);
  }
  const sql = `SELECT * FROM asks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY queued_at, id`;
  return (db.query(sql).all(...args) as Row[]).map((r) => hydrate(r)!);
}
