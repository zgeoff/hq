import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { forwardOf } from './forward-of.ts';
import { queued } from './queued.ts';

// A caller that must send one message once, across separate events, passes its own idemKey: a
// second call with the same key queues nothing.
export function enqueueOnce(db: Database, eventSeq: number, rawTarget: string, text: string, idemKey: string): void {
  const target = forwardOf(db, rawTarget);
  const r = db.query(
    `INSERT INTO outbox (event_seq, target, text, idem_key, status, created_at, topic)
     VALUES (?, ?, ?, ?, 'pending', ?, NULL) ON CONFLICT (idem_key) DO NOTHING`,
  ).run(eventSeq, target, text, idemKey, iso(now()));
  if (r.changes > 0) queued.push(Number(r.lastInsertRowid));
}
