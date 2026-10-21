import type { Database } from 'bun:sqlite';
import { parseAskRow as hydrate } from './parse-ask-row.ts';
import type { Ask, Row } from './types.ts';

export function getAsk(db: Database, id: string): Ask | null {
  return hydrate(db.query('SELECT * FROM asks WHERE id = ?').get(id) as Row | null);
}
