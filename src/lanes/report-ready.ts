import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';

export function reportReady(db: Database, count: number, actor: string): void {
  db.transaction(() => {
    setMeta(db, 'lanes_ready', JSON.stringify({ count, at: iso(now()), by: actor }));
    logEvent(db, 'hq', 'lanes', 'ready-count', actor, null, null, { count });
  }).immediate();
}
