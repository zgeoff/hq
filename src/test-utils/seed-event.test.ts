import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { seedEvent } from './seed-event.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readEvents: () => fresh.db.query('SELECT seq, subject, subject_id, action, actor, from_state, to_state, at, data FROM events').all() };
}

test('#seedEvent logs an event and returns its sequence number', () => {
  const ctx = setupTest();

  const seq = seedEvent(ctx, { subject: 'run', subjectID: 'GEO-9001', action: 'state', from: 'working', to: 'done', data: { note: 'Descaled.' } });

  expect([seq, ctx.readEvents()]).toStrictEqual([1, [{ seq: 1, subject: 'run', subject_id: 'GEO-9001', action: 'state', actor: 'kettle-bot', from_state: 'working', to_state: 'done', at: '2026-10-14T01:00:00Z', data: '{"note":"Descaled."}' }]]);
});
