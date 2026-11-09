import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { forwardOf } from './forward-of.ts';
import { queued } from './queued.ts';

interface OnceMessage {
  eventSeq: number;
  target: string;
  text: string;
  idemKey: string;
}

// A caller that must send one message once, across separate events, passes its own idemKey: a
// second call with the same key queues nothing.
export function enqueueOnce(db: Database, message: OnceMessage): void {
  const target = forwardOf(db, message.target);
  const result = db
    .query(
      `INSERT INTO outbox (event_seq, target, text, idem_key, status, created_at, topic)
     VALUES (?, ?, ?, ?, 'pending', ?, NULL) ON CONFLICT (idem_key) DO NOTHING`,
    )
    .run(message.eventSeq, target, message.text, message.idemKey, iso(now()));
  if (result.changes > 0) {
    queued.push(Number(result.lastInsertRowid));
  }
}
