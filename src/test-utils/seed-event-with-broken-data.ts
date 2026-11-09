import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { buildMockEventRow } from './build-mock-event-row.ts';
import type { EventRow } from './build-mock-event-row.ts';
import type { EventsDeps } from './types.ts';

export function seedEventWithBrokenData(deps: EventsDeps, input: Partial<EventRow> = {}): void {
  // An event whose data is not JSON: logEvent always writes JSON.
  const row = { ...buildMockEventRow({ at: iso(now()), ...input }), data: '{' };
  deps.db
    .query('INSERT INTO events (subject, subject_id, action, from_state, to_state, actor, at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(row.subject, row.subject_id, row.action, row.from_state, row.to_state, row.actor, row.at, row.data);
}
