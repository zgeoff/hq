import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../../test/helpers.ts';
import { seedGrantAction } from './seed-grant-action.ts';
import { seedGrantMark } from './seed-grant-mark.ts';
import { seedVoidedGrantAction } from './seed-voided-grant-action.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-14T01:00:00Z');
  return { db: fresh.db, readActions: () => fresh.db.query('SELECT id, target, voided_at, voided_by, void_reason FROM grant_actions ORDER BY id').all() };
}

test('#seedVoidedGrantAction logs an act and voids it as the owner, and input overrides apply', async () => {
  const ctx = setupTest();
  seedGrantMark(ctx);

  await seedVoidedGrantAction(ctx, { target: 'kettle#8', reason: 'wrong kettle', voidedAt: '2026-10-14T02:00:00Z' });

  expect(ctx.readActions()).toStrictEqual([{ id: 1, target: 'kettle#8', voided_at: '2026-10-14T02:00:00Z', voided_by: 'z-stu', void_reason: 'wrong kettle' }]);
});

test('#seedVoidedGrantAction leaves the acts logged before it live', async () => {
  const ctx = setupTest();
  seedGrantMark(ctx);
  seedGrantAction(ctx, { target: 'kettle#7' });

  await seedVoidedGrantAction(ctx, { target: 'kettle#8' });

  expect(ctx.readActions()).toMatchObject([{ id: 1, voided_at: null }, { id: 2, voided_at: '2026-10-14T01:30:00Z' }]);
});
