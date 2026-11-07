import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { NewsItemSchema } from './news-item-schema.ts';
import type { NewsItem } from './types.ts';

export function newsTagged(db: Database, tag: string, since: Date | string): NewsItem[] {
  const sinceAt = typeof since === 'string' ? since : iso(since);
  const query = kdb(db)
    .selectFrom('news')
    .selectAll()
    .where('tag', '=', tag)
    .where('added_at', '>=', sinceAt)
    .orderBy('id')
    .compile();
  return runSyncQuery(db, query, NewsItemSchema);
}
