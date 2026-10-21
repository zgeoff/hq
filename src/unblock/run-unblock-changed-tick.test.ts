import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUnblockItems } from '../../test/create-unblock-items.ts';
import { getMeta } from '../db/get-meta.ts';
import { openDb } from '../db/open-db.ts';
import { owner } from '../owner.ts';
import { closeUnblock } from './close-unblock.ts';
import { markPushed } from './mark-pushed.ts';
import { newSincePush } from './new-since-push.ts';
import { runUnblockChangedTick } from './run-unblock-changed-tick.ts';
import { uptoFor } from './upto-for.ts';

// Sydney is on AEDT (UTC+11) in October: 12:00 Sydney is 01:00Z, 04:00 is 17:00Z of the day before.
function setupTest() {
  const area = mkdtempSync(join(tmpdir(), 'hq-unblock-changed-')),
    db = openDb(join(area, 'hq.db'));
  onTestFinished(() => {
    db.close();
    rmSync(area, { recursive: true, force: true });
  });
  return {
    db,
    clearOutbox: () => db.query('DELETE FROM outbox').run(),
    readOutbox: () => db.query('SELECT target, text, topic FROM outbox WHERE topic = ? ORDER BY id').all('unblock-changed'),
  };
}

test('it queues unblock list changed to the owner when new items exist outside quiet hours', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { kettle: { task: 'Try the new kettle' } });

  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'))).toBe(true);
  expect(ctx.readOutbox()).toStrictEqual([{ target: owner(), text: 'unblock list changed', topic: 'unblock-changed' }]);
});

test('it records the notice under the unblock cursor', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { kettle: { task: 'Try the new kettle' } });
  runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'));

  expect(ctx.db.query("SELECT subject, subject_id, actor FROM events WHERE action = 'changed-told'").all()).toStrictEqual([{ subject: 'hq', subject_id: 'unblock-cursor', actor: 'hq-lanes' }]);
});

test('it queues nothing without new items', () => {
  const ctx = setupTest();

  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'))).toBe(false);
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it queues nothing from 03:00 to 07:00 Sydney time', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { kettle: { task: 'Try the new kettle' } });

  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-20T17:00:00Z'))).toBe(false);
  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-20T19:59:00Z'))).toBe(false);
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it queues at 07:00 Sydney time the items it held back overnight', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { kettle: { task: 'Try the new kettle' } });
  runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-20T17:00:00Z'));

  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-20T20:00:00Z'))).toBe(true);
  expect(ctx.readOutbox()).toHaveLength(1);
});

test('it does not queue again on the next tick for the same item', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { kettle: { task: 'Try the new kettle' } });
  runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'));
  ctx.clearOutbox();

  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:05:00Z'))).toBe(false);
  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:59:00Z'))).toBe(false);
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it queues again after 60 minutes while the same item stays unpushed', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { kettle: { task: 'Try the new kettle' } });
  runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'));
  ctx.clearOutbox();

  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T02:00:00Z'))).toBe(true);
  expect(ctx.readOutbox()).toHaveLength(1);
  expect(getMeta(ctx.db, 'unblock_changed_told_at')).toBe('2026-10-21T02:00:00Z');
});

test('it queues again at once for a newer item', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { kettle: { task: 'Try the new kettle' } });
  runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'));
  ctx.clearOutbox();
  createUnblockItems(ctx.db, { toaster: { task: 'Try the new toaster' } });

  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:05:00Z'))).toBe(true);
  expect(ctx.readOutbox()).toHaveLength(1);
});

test('it does not queue at once when the newest item is dropped and an older one stays unpushed', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { kettle: { task: 'Try the new kettle' }, toaster: { task: 'Try the new toaster' } });
  runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'));
  ctx.clearOutbox();
  closeUnblock(ctx.db, 'toaster', 'dropped', null, 'z-stu');

  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:05:00Z'))).toBe(false);
  expect(ctx.readOutbox()).toStrictEqual([]);
});

test('it queues again after 60 minutes when the newest item is dropped and an older one stays unpushed', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { kettle: { task: 'Try the new kettle' }, toaster: { task: 'Try the new toaster' } });
  runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'));
  ctx.clearOutbox();
  closeUnblock(ctx.db, 'toaster', 'dropped', null, 'z-stu');

  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T02:00:00Z'))).toBe(true);
  expect(ctx.readOutbox()).toHaveLength(1);
});

test('it stops once the push moves the cursor past the items', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { kettle: { task: 'Try the new kettle' } });
  runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T01:00:00Z'));
  ctx.clearOutbox();
  markPushed(ctx.db, uptoFor(newSincePush(ctx.db), ctx.db), 'z-stu');

  expect(runUnblockChangedTick(ctx.db, 'hq-lanes', new Date('2026-10-21T02:00:00Z'))).toBe(false);
  expect(ctx.readOutbox()).toStrictEqual([]);
});
