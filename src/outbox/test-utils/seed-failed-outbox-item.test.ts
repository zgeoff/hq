import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedFailedOutboxItem } from './seed-failed-outbox-item.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRows: () => fresh.db.query('SELECT target, text, topic, status, attempts, last_error FROM outbox').all() };
}

test('#seedFailedOutboxItem queues a row and marks it failed', () => {
  const ctx = setupTest();

  seedFailedOutboxItem(ctx);

  expect(ctx.readRows()).toStrictEqual([{ target: 'kettle-bot', text: 'Invented kettle note', topic: null, status: 'failed', attempts: 1, last_error: 'invented send failure' }]);
});

test('#seedFailedOutboxItem applies input overrides', () => {
  const ctx = setupTest();

  seedFailedOutboxItem(ctx, { target: 'z-urn', text: 'Descale it', topic: 'descale' });

  expect(ctx.readRows()).toMatchObject([{ target: 'z-urn', text: 'Descale it', topic: 'descale' }]);
});
