import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { buildMockEventRow } from './build-mock-event-row.ts';
import type { EventRow } from './build-mock-event-row.ts';
import type { EventsDeps } from './types.ts';

export function seedConsoleReviewEventsWithoutFacts(deps: EventsDeps, input: Partial<EventRow> = {}): number {
  const row = buildMockEventRow({ subject: 'unblock', action: 'console-review', actor: 'console', at: iso(now()), ...input });
  const { facts, ...data } = z.record(z.string(), z.unknown()).parse(JSON.parse(row.data));

  // A console review event from before it kept the item's facts: recordConsoleReview always writes them.
  const inserted = deps.db
    .query('INSERT INTO events (subject, subject_id, action, from_state, to_state, actor, at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(row.subject, row.subject_id, row.action, row.from_state, row.to_state, row.actor, row.at, JSON.stringify(data));

  return Number(inserted.lastInsertRowid);
}
