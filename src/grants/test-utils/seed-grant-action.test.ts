import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../../test/helpers.ts';
import { seedGrantAction } from './seed-grant-action.ts';
import { seedGrantMark } from './seed-grant-mark.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-14T01:00:00Z');
  return { db: fresh.db, readActions: () => fresh.db.query('SELECT id, grant_name, target, note, actor, at, voided_at FROM grant_actions ORDER BY id').all() };
}

test('#seedGrantAction logs a live act under a named grant, and input overrides apply', () => {
  const ctx = setupTest();
  seedGrantMark(ctx);

  seedGrantAction(ctx, { target: 'kettle#8', note: 'on green' });

  expect(ctx.readActions()).toStrictEqual([{ id: 1, grant_name: 'kettle-merges', target: 'kettle#8', note: 'on green', actor: 'teapot-bot', at: '2026-10-14T01:00:00Z', voided_at: null }]);
});

test('#seedGrantAction refuses a grant no mark names', () => {
  const ctx = setupTest();

  expect(() => seedGrantAction(ctx)).toThrow('no grant named kettle-merges');
});
