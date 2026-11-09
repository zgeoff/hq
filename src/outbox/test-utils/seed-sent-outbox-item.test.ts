import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedSentOutboxItem } from './seed-sent-outbox-item.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRows: () => fresh.db.query('SELECT target, text, topic, status, attempts, sent_at FROM outbox').all() };
}

test('#seedSentOutboxItem queues a row and marks it sent', () => {
  const ctx = setupTest();

  seedSentOutboxItem(ctx);

  expect(ctx.readRows()).toStrictEqual([{ target: 'kettle-bot', text: 'Invented kettle note', topic: null, status: 'sent', attempts: 1, sent_at: '2026-10-14T01:00:00Z' }]);
});

test('#seedSentOutboxItem applies input overrides', () => {
  const ctx = setupTest();

  seedSentOutboxItem(ctx, { target: 'z-urn', text: 'Descale it', topic: 'descale' });

  expect(ctx.readRows()).toMatchObject([{ target: 'z-urn', text: 'Descale it', topic: 'descale' }]);
});
