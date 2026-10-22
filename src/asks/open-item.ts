import type { Database } from 'bun:sqlite';
import { parseAskRow as hydrate } from './parse-ask-row.ts';
import type { Ask, Row } from './types.ts';

export function openItem(db: Database): Ask | null {
  return hydrate(db.query(`SELECT * FROM asks WHERE state = 'open'`).get() as Row | null);
}
