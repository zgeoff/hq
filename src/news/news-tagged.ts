import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import type { NewsItem } from './types.ts';

// Items with a tag added at or after `since`, oldest first (the weekly review reads weekly-flag).
export function newsTagged(db: Database, tag: string, since: Date | string): NewsItem[] {
  return db.query('SELECT * FROM news WHERE tag = ? AND added_at >= ? ORDER BY id').all(tag, typeof since === 'string' ? since : iso(since)) as NewsItem[];
}
