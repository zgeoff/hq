import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedOutage } from './seed-outage.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readOutages: () => fresh.db.query('SELECT id, started_at, detected_at, ended_at, alert_seq, recover_seq, kind FROM outages').all() };
}

test('#seedOutage opens a down outage and returns its id, and input overrides apply', () => {
  const ctx = setupTest();

  const id = seedOutage(ctx, { startedAt: '2026-10-15T00:00:00Z', detectedAt: '2026-10-15T00:03:00Z' });

  expect([id, ctx.readOutages()]).toStrictEqual([1, [{ id: 1, started_at: '2026-10-15T00:00:00Z', detected_at: '2026-10-15T00:03:00Z', ended_at: null, alert_seq: null, recover_seq: null, kind: 'down' }]]);
});
