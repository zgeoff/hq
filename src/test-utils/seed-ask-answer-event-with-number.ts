import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { buildMockEventRow } from './build-mock-event-row.ts';
import type { EventRow } from './build-mock-event-row.ts';
import type { TestDeps } from './build-seeder.ts';

export function seedAskAnswerEventWithNumber(deps: TestDeps, input: Partial<EventRow> = {}): number {
  const row = { ...buildMockEventRow({ subject: 'ask', action: 'answered', at: iso(now()), ...input }), data: '{"answer":42}' };

  // An answered-ask event whose answer is a number: the answer writers only store text.
  const inserted = deps.db
    .query('INSERT INTO events (subject, subject_id, action, from_state, to_state, actor, at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(row.subject, row.subject_id, row.action, row.from_state, row.to_state, row.actor, row.at, row.data);

  return Number(inserted.lastInsertRowid);
}
