import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { dropTopic } from './drop-topic.ts';
import { forwardOf } from './forward-of.ts';
import { queued } from './queued.ts';

// The key makes every retry, here and at atc, the same message: nobody hears it twice. With a
// topic, the new message supersedes any unsent one on the same target and topic: after an atc
// outage only the newest goes out, never a burst. A caller that must send one message once, across
// separate events, passes its own idemKey.
export function enqueue(db: Database, eventSeq: number, rawTarget: string, text: string, topic: string | null = null, idemKey: string | null = null): void {
  const target = forwardOf(db, rawTarget);
  if (topic) dropTopic(db, target, topic);
  const r = db.query(
    `INSERT INTO outbox (event_seq, target, text, idem_key, status, created_at, topic)
     VALUES (?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT (idem_key) DO NOTHING`,
  ).run(eventSeq, target, text, idemKey ?? `hq-ev${eventSeq}-${target}`, iso(now()), topic);
  if (r.changes > 0) queued.push(Number(r.lastInsertRowid));
}
