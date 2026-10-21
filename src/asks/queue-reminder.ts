import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { lastQuietEnd } from './last-quiet-end.ts';
import { listAsks } from './list-asks.ts';
import { nextEligible } from './next-eligible.ts';
import { waitReasons } from './wait-reasons.ts';

// When the queue could open but the owner has not heard about the next item
// since it became openable (it arrived or fell due in quiet hours, or behind a
// hold), tell the owner once. Run by the watcher every few minutes.
export function queueReminder(db: Database, actor: string): { reminded: string | null; why: string } {
  return db
    .transaction(() => {
      const reasons = waitReasons(db);
      if (reasons.length) return { reminded: null, why: reasons.join('; ') };
      const next = nextEligible(db);
      if (!next) return { reminded: null, why: 'queue empty' };
      const t = now();
      const since = next.state === 'later' && next.due_at ? next.due_at : next.queued_at;
      // Compare as instants: stored times mix second and millisecond precision.
      const holdEnd = getMeta(db, 'hold_released_at');
      const epoch = Math.max(Date.parse(since), lastQuietEnd(t).getTime(), holdEnd ? Date.parse(holdEnd) : 0);
      const told = getMeta(db, `told:${next.id}`);
      if (told && Date.parse(told) >= epoch) return { reminded: null, why: `${owner()} already told about ${next.id}` };
      const waiting = listAsks(db, { states: ['queued'] }).length + (db.query(`SELECT COUNT(*) AS n FROM asks WHERE state='later' AND due_at <= ?`).get(iso(t)) as { n: number }).n;
      const seq = logEvent(db, 'ask', next.id, 'reminded', actor, next.state, next.state, { waiting });
      enqueue(db, seq, owner(), `${waiting} waiting for the owner; the floor is free. Next: ${next.kind} ${next.id}: ${next.title}. Open it with: hq open`, 'queue-reminder');
      setMeta(db, `told:${next.id}`, t.toISOString());
      return { reminded: next.id, why: 'told' };
    })
    .immediate();
}
