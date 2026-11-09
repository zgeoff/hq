import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { buildMockEventRow } from './build-mock-event-row.ts';
import type { EventRow } from './build-mock-event-row.ts';
import type { TestDeps } from './build-seeder.ts';

export function seedAskEventsWithoutDetail(deps: TestDeps, input: Partial<EventRow> = {}): number {
  const row = buildMockEventRow({ subject: 'ask', action: 'answered', at: iso(now()), ...input });
  const { title, issues, forSession, ...data } = z.record(z.string(), z.unknown()).parse(JSON.parse(row.data));

  // An ask event from before ask events kept a title, issues and session: addAsk and answerAsk always write all three.
  const inserted = deps.db
    .query('INSERT INTO events (subject, subject_id, action, from_state, to_state, actor, at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(row.subject, row.subject_id, row.action, row.from_state, row.to_state, row.actor, row.at, JSON.stringify(data));

  return Number(inserted.lastInsertRowid);
}
