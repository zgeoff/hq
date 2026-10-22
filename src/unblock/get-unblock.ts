import type { Database } from 'bun:sqlite';
import { parseUnblockRow as hydrate } from './parse-unblock-row.ts';
import type { Row, UnblockItem } from './types.ts';

export function getUnblock(db: Database, id: string): UnblockItem | null {
  const r = db.query('SELECT * FROM unblocks WHERE id = ?').get(id) as Row | null;
  return r ? hydrate(r) : null;
}
