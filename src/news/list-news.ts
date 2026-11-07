import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { NewsItemSchema } from './news-item-schema.ts';
import type { NewsItem } from './types.ts';

// Unread: the oldest first, so `read --upto <last shown>` never covers an item it didn't show.
export function listNews(db: Database, opts: { all: boolean; limit: number }): NewsItem[] {
  const news = kdb(db).selectFrom('news').selectAll();
  if (!opts.all) {
    return runSyncQuery(db, news.where('read_at', 'is', null).orderBy('id').limit(opts.limit).compile(), NewsItemSchema);
  }
  return runSyncQuery(db, news.orderBy('id', 'desc').limit(opts.limit).compile(), NewsItemSchema).toReversed();
}
