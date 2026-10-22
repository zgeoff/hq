import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { owner } from '../owner.ts';
import { addUnblock } from './add-unblock.ts';
import { closeUnblock } from './close-unblock.ts';
import { getUnblock } from './get-unblock.ts';
import { settleUnblock } from './settle-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test("it never tells the owner's session that an item settled, even when notify names it", () => {
  const ctx = setupTest();
  const checked = addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test', minutes: null, unblocks: [], notify: [owner(), 'kettle-session'], actor: 'kettle-triage' }).item;

  settleUnblock(ctx.db, checked, 'settled: issue:KET-7 Done', 'kettle-bot');

  expect(ctx.db.query('SELECT target FROM outbox ORDER BY target').all()).toStrictEqual([{ target: 'kettle-session' }, { target: 'kettle-triage' }]);
});

test('it refuses to settle an item that was closed and reopened since it was checked, and tells no one', () => {
  const ctx = setupTest();
  const checked = addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage' }).item;
  closeUnblock(ctx.db, 'steam-test', 'dropped', null, 'z-stu');
  addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage' });

  expect(() => settleUnblock(ctx.db, checked, 'settled: issue:KET-7 Done', 'kettle-bot')).toThrow(expect.objectContaining({ code: 'item_changed' }));
  expect(getUnblock(ctx.db, 'steam-test')?.state).toBe('open');
  expect(ctx.db.query('SELECT target FROM outbox').all()).toStrictEqual([]);
});
