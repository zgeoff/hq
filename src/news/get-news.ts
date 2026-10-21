import type { Database } from 'bun:sqlite';
import type { NewsItem } from './types.ts';

export function getNews(db: Database, id: number): NewsItem | null {
  return db.query('SELECT * FROM news WHERE id = ?').get(id) as NewsItem | null;
}
