import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedClosedOutage } from './seed-closed-outage.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readOutages: () => fresh.db.query('SELECT id, started_at, detected_at, ended_at, alert_seq, recover_seq, kind FROM outages').all() };
}

test('#seedClosedOutage ends a down outage with the end time and an event to recover on', () => {
  const ctx = setupTest();

  const id = seedClosedOutage(ctx, { startedAt: '2026-10-15T00:00:00Z', detectedAt: '2026-10-15T00:03:00Z', endedAt: '2026-10-15T00:09:00Z' });

  expect([id, ctx.readOutages()]).toStrictEqual([1, [{ id: 1, started_at: '2026-10-15T00:00:00Z', detected_at: '2026-10-15T00:03:00Z', ended_at: '2026-10-15T00:09:00Z', alert_seq: null, recover_seq: 1, kind: 'down' }]]);
});
