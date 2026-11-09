import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedFailedOutbox } from './seed-failed-outbox.ts';
import { seedOutboxItem } from './seed-outbox-item.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRows: () => fresh.db.query('SELECT text, status, attempts, last_error FROM outbox ORDER BY id').all() };
}

test('#seedFailedOutbox marks every pending row failed with the error', () => {
  const ctx = setupTest();
  seedOutboxItem(ctx, { text: 'One' });

  seedFailedOutbox(ctx, { error: 'no live session named z-kettle' });

  expect(ctx.readRows()).toStrictEqual([{ text: 'One', status: 'failed', attempts: 1, last_error: 'no live session named z-kettle' }]);
});

test('#seedFailedOutbox marks only the rows with the given text', () => {
  const ctx = setupTest();
  seedOutboxItem(ctx, { text: 'One' });
  seedOutboxItem(ctx, { text: 'Two' });

  seedFailedOutbox(ctx, { text: 'One' });

  expect(ctx.readRows()).toStrictEqual([
    { text: 'One', status: 'failed', attempts: 1, last_error: 'invented send failure' },
    { text: 'Two', status: 'pending', attempts: 0, last_error: null },
  ]);
});

test('#seedFailedOutbox marks only the rows with the given topic', () => {
  const ctx = setupTest();
  seedOutboxItem(ctx, { text: 'One', topic: 'lanes' });
  seedOutboxItem(ctx, { text: 'Two' });

  seedFailedOutbox(ctx, { topic: 'lanes' });

  expect(ctx.readRows()).toStrictEqual([
    { text: 'One', status: 'failed', attempts: 1, last_error: 'invented send failure' },
    { text: 'Two', status: 'pending', attempts: 0, last_error: null },
  ]);
});
