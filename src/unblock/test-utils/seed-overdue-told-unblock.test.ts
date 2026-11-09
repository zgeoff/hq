import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedOverdueToldUnblock } from './seed-overdue-told-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  return { db: fresh.db, readUnblocks: () => fresh.db.query('SELECT id, state, kind, deadline, overdue_told_at FROM unblocks ORDER BY id').all() };
}

test('#seedOverdueToldUnblock stores an open item whose passed deadline the sessions were told of', () => {
  const ctx = setupTest();

  seedOverdueToldUnblock(ctx);

  expect(ctx.readUnblocks()).toStrictEqual([{ id: 'descale', state: 'open', kind: 'watch', deadline: '2026-10-14T00:30:00Z', overdue_told_at: '2026-10-14T00:40:00Z' }]);
});

test('#seedOverdueToldUnblock applies input overrides', () => {
  const ctx = setupTest();

  seedOverdueToldUnblock(ctx, { id: 'kettle-release', deadline: '2026-10-13T00:00:00Z' });

  expect(ctx.readUnblocks()).toMatchObject([{ id: 'kettle-release', deadline: '2026-10-13T00:00:00Z', overdue_told_at: '2026-10-13T00:10:00Z' }]);
});
