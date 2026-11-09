import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedUnblock } from './seed-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  return { db: fresh.db, readUnblocks: () => fresh.db.query('SELECT id, task, state, kind, deadline, added_by, overdue_told_at FROM unblocks ORDER BY id').all() };
}

test('#seedUnblock stores an open unblock item, and input overrides apply', () => {
  const ctx = setupTest();

  seedUnblock(ctx, { id: 'kettle-release', task: 'Live-check the kettle release', kind: 'watch' });

  expect(ctx.readUnblocks()).toStrictEqual([{ id: 'kettle-release', task: 'Live-check the kettle release', state: 'open', kind: 'watch', deadline: null, added_by: 'kettle-triage', overdue_told_at: null }]);
});

test('#seedUnblock stores an item that needs the owner by default', () => {
  const ctx = setupTest();

  seedUnblock(ctx);

  expect(ctx.readUnblocks()).toMatchObject([{ id: 'descale', kind: 'owner' }]);
});
