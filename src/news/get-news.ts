import type { Database } from 'bun:sqlite';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { NewsItemSchema } from './news-item-schema.ts';
import type { NewsItem } from './types.ts';

export function getNews(db: Database, id: number): NewsItem | null {
  return runSyncRow(db, kdb(db).selectFrom('news').selectAll().where('id', '=', id).compile(), NewsItemSchema);
}
