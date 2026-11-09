import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedOutboxItem } from './seed-outbox-item.ts';
import { seedSentOutbox } from './seed-sent-outbox.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRows: () => fresh.db.query('SELECT text, status, attempts, sent_at FROM outbox ORDER BY id').all() };
}

test('#seedSentOutbox marks every pending row sent', () => {
  const ctx = setupTest();
  seedOutboxItem(ctx, { text: 'One' });
  seedOutboxItem(ctx, { text: 'Two' });

  seedSentOutbox(ctx);

  expect(ctx.readRows()).toStrictEqual([
    { text: 'One', status: 'sent', attempts: 1, sent_at: '2026-10-14T01:00:00Z' },
    { text: 'Two', status: 'sent', attempts: 1, sent_at: '2026-10-14T01:00:00Z' },
  ]);
});

test('#seedSentOutbox marks only the rows with the given text', () => {
  const ctx = setupTest();
  seedOutboxItem(ctx, { text: 'One' });
  seedOutboxItem(ctx, { text: 'Two' });

  seedSentOutbox(ctx, { text: 'Two' });

  expect(ctx.readRows()).toStrictEqual([
    { text: 'One', status: 'pending', attempts: 0, sent_at: null },
    { text: 'Two', status: 'sent', attempts: 1, sent_at: '2026-10-14T01:00:00Z' },
  ]);
});

test('#seedSentOutbox marks only the rows with the given topic', () => {
  const ctx = setupTest();
  seedOutboxItem(ctx, { text: 'One', topic: 'lanes' });
  seedOutboxItem(ctx, { text: 'Two' });

  seedSentOutbox(ctx, { topic: 'lanes' });

  expect(ctx.readRows()).toStrictEqual([
    { text: 'One', status: 'sent', attempts: 1, sent_at: '2026-10-14T01:00:00Z' },
    { text: 'Two', status: 'pending', attempts: 0, sent_at: null },
  ]);
});
