import type { Database } from 'bun:sqlite';
import type { NewsItem } from './types.ts';

// Unread: the oldest first, so `read --upto <last shown>` never covers an item it didn't show.
// --all: the newest, as history.
export function listNews(db: Database, opts: { all: boolean; limit: number }): NewsItem[] {
  if (!opts.all) return db.query('SELECT * FROM news WHERE read_at IS NULL ORDER BY id LIMIT ?').all(opts.limit) as NewsItem[];
  return (db.query('SELECT * FROM news ORDER BY id DESC LIMIT ?').all(opts.limit) as NewsItem[]).reverse();
}
