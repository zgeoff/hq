import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedOutboxItem } from './seed-outbox-item.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRows: () => fresh.db.query('SELECT target, text, status, topic, attempts FROM outbox').all() };
}

test('#seedOutboxItem queues a pending row for the target', () => {
  const ctx = setupTest();

  const row = seedOutboxItem(ctx, { target: 'z-urn', text: 'Descale it', topic: 'descale' });

  expect([row.status, ctx.readRows()]).toStrictEqual(['pending', [{ target: 'z-urn', text: 'Descale it', status: 'pending', topic: 'descale', attempts: 0 }]]);
});
