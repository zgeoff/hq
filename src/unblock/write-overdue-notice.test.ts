import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { addUnblock } from './add-unblock.ts';
import { writeOverdueNotice } from './write-overdue-notice.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it tells the owner session it is given, beside the adder and the notify sessions', () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', deadline: '2026-10-14T00:30:00Z' });

  const told = writeOverdueNotice(ctx.db, { id: 'kettle-release', actor: 'kettle-bot', at: new Date('2026-10-14T01:00:00Z'), ownerSession: 'teapot-owner' });

  expect(told).toBe(true);
  expect(ctx.db.query('SELECT target FROM outbox ORDER BY target').all()).toStrictEqual([{ target: 'kettle-qa' }, { target: 'kettle-triage' }, { target: 'teapot-owner' }]);
});

test('it tells no one before the deadline', () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', deadline: '2026-10-14T02:00:00Z' });

  const told = writeOverdueNotice(ctx.db, { id: 'kettle-release', actor: 'kettle-bot', at: new Date('2026-10-14T01:00:00Z'), ownerSession: 'teapot-owner' });

  expect(told).toBe(false);
  expect(ctx.db.query('SELECT count(*) AS total FROM outbox').get()).toStrictEqual({ total: 0 });
});
