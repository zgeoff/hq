import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedUnreadyOutage } from './seed-unready-outage.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readOutages: () => fresh.db.query('SELECT id, started_at, detected_at, ended_at, alert_seq, recover_seq, kind FROM outages').all() };
}

test('#seedUnreadyOutage opens an unready outage and returns its id', () => {
  const ctx = setupTest();

  const id = seedUnreadyOutage(ctx, { startedAt: '2026-10-15T00:00:00Z' });

  expect([id, ctx.readOutages()]).toStrictEqual([1, [{ id: 1, started_at: '2026-10-15T00:00:00Z', detected_at: '2026-10-14T00:53:00Z', ended_at: null, alert_seq: null, recover_seq: null, kind: 'unready' }]]);
});
