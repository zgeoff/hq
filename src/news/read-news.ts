import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';

export function readNews(db: Database, upto: number, actor: string): number {
  if (!Number.isInteger(upto) || upto < 1) throw new HqError('bad_args', '--upto must be an item id');
  return db
    .transaction(() => {
      const n = db.query('UPDATE news SET read_at = ? WHERE id <= ? AND read_at IS NULL').run(iso(now()), upto).changes;
      if (n) logEvent(db, 'hq', 'news', 'news-read', actor, null, null, { upto, count: n });
      return n;
    })
    .immediate();
}
