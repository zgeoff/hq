import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedLinkedUnblock } from './seed-linked-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  return { db: fresh.db, readUnblocks: () => fresh.db.query('SELECT id, task, state, title, item FROM unblocks ORDER BY id').all() };
}

test('#seedLinkedUnblock stores an open unblock item whose item holds the links', () => {
  const ctx = setupTest();

  seedLinkedUnblock(ctx, { id: 'review-4', task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] });

  expect(ctx.readUnblocks()).toStrictEqual([
    {
      id: 'review-4',
      task: 'Review kettle#4 and say lgtm',
      state: 'open',
      title: null,
      item: JSON.stringify({ details: [], unblocks: [], links: [{ label: 'kettle#4', url: 'https://github.com/zgeoff/kettle/pull/4', subject: true }] }),
    },
  ]);
});
