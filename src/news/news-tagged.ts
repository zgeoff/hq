import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import type { NewsItem } from './types.ts';

export function newsTagged(db: Database, tag: string, since: Date | string): NewsItem[] {
  return db.query('SELECT * FROM news WHERE tag = ? AND added_at >= ? ORDER BY id').all(tag, typeof since === 'string' ? since : iso(since)) as NewsItem[];
}
