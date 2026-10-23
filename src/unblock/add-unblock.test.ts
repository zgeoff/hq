import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { addUnblock } from './add-unblock.ts';
import { getUnblock } from './get-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('a refresh that leaves out the kind and the deadline keeps the stored ones', () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', deadline: '2026-10-20T00:00:00Z' });

  const refreshed = addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release, both models', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage' });

  expect(refreshed.result).toBe('updated');
  expect(refreshed.item.kind).toBe('watch');
  expect(refreshed.item.deadline).toBe('2026-10-20T00:00:00Z');
});

test('a moved deadline clears the overdue notice, so the new deadline tells the sessions again', () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', deadline: '2026-10-14T00:30:00Z' });
  ctx.db.query("UPDATE unblocks SET overdue_told_at = '2026-10-14T00:40:00Z' WHERE id = 'kettle-release'").run();

  addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', deadline: '2026-10-21T00:00:00Z' });

  expect(getUnblock(ctx.db, 'kettle-release')?.overdue_told_at).toBeNull();
});

test('a new item with no kind given needs the owner and has no deadline', () => {
  const ctx = setupTest();

  const added = addUnblock(ctx.db, { id: 'descale', task: 'Descale the kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage' });

  expect(added.item.kind).toBe('owner');
  expect(added.item.deadline).toBeNull();
  expect(added.item.overdue_told_at).toBeNull();
});
