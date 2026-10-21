import type { Database } from 'bun:sqlite';
import { compareUnblock } from './compare-unblock.ts';
import { parseUnblockRow as hydrate } from './parse-unblock-row.ts';
import type { Row, UnblockItem } from './types.ts';

export function listUnblocks(db: Database, state: 'open' | 'done' | 'dropped' | 'all' = 'open'): UnblockItem[] {
  const rows = (state === 'all' ? db.query('SELECT * FROM unblocks').all() : db.query('SELECT * FROM unblocks WHERE state = ?').all(state)) as Row[];
  return rows.map(hydrate).sort(compareUnblock);
}
