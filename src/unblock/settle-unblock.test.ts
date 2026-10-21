import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { owner } from '../owner.ts';
import { addUnblock } from './add-unblock.ts';
import { settleUnblock } from './settle-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test("it never tells the owner's session that an item settled, even when notify names it", () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test', minutes: null, unblocks: [], notify: [owner(), 'kettle-session'], actor: 'kettle-triage' });

  settleUnblock(ctx.db, 'steam-test', 'settled: issue:KET-7 Done', 'kettle-bot');

  expect(ctx.db.query('SELECT target FROM outbox ORDER BY target').all()).toStrictEqual([{ target: 'kettle-session' }, { target: 'kettle-triage' }]);
});
