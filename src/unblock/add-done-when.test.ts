import { expect, onTestFinished, test } from 'bun:test';
import { createUnblockItems } from '../../test/create-unblock-items.ts';
import { freshDb } from '../../test/helpers.ts';
import { addDoneWhen } from './add-done-when.ts';
import { addUnblock } from './add-unblock.ts';
import { closeUnblock } from './close-unblock.ts';
import { getUnblock } from './get-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it adds conditions to an open item and keeps the ones it has', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });

  const item = addDoneWhen(
    ctx.db,
    'steam-test',
    [
      { kind: 'issue', ref: 'KET-7' },
      { kind: 'pr', ref: 'kettle-co/kettle#4' },
    ],
    'kettle-triage',
  );

  expect(item.done_when).toStrictEqual([
    { kind: 'issue', ref: 'KET-7' },
    { kind: 'pr', ref: 'kettle-co/kettle#4' },
  ]);
  expect(ctx.db.query("SELECT action FROM events WHERE subject_id = 'steam-test' ORDER BY seq DESC LIMIT 1").get()).toStrictEqual({ action: 'done-when' });
});

test('it changes nothing when the conditions are already there', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });
  const before = ctx.db.query('SELECT count(*) AS n FROM events').get();

  addDoneWhen(ctx.db, 'steam-test', [{ kind: 'issue', ref: 'KET-7' }], 'kettle-triage');

  expect(ctx.db.query('SELECT count(*) AS n FROM events').get()).toStrictEqual(before);
});

test('it refuses a closed item', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test' } });
  closeUnblock(ctx.db, 'steam-test', 'done', null, 'kettle-triage');

  expect(() => addDoneWhen(ctx.db, 'steam-test', [{ kind: 'issue', ref: 'KET-7' }], 'kettle-triage')).toThrow('steam-test is done, not open');
});

test('it refuses an unknown item', () => {
  const ctx = setupTest();

  expect(() => addDoneWhen(ctx.db, 'nothing', [{ kind: 'issue', ref: 'KET-7' }], 'kettle-triage')).toThrow('no unblock item nothing');
});

test('it adds the conditions given when an open item is filed again', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });

  const added = addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage', doneWhen: [{ kind: 'doc', ref: 'abc123def456' }] });

  expect(added.result).toBe('updated');
  expect(getUnblock(ctx.db, 'steam-test')?.done_when).toStrictEqual([
    { kind: 'issue', ref: 'KET-7' },
    { kind: 'doc', ref: 'abc123def456' },
  ]);
});

test('it keeps the stored conditions when an open item is filed again without any', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });

  const kept = addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage' });

  expect(kept.result).toBe('noop');
  expect(getUnblock(ctx.db, 'steam-test')?.done_when).toStrictEqual([{ kind: 'issue', ref: 'KET-7' }]);
});

test('it records the conditions a refresh adds in the updated event', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });

  addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage', doneWhen: [{ kind: 'doc', ref: 'abc123def456' }] });

  expect(ctx.db.query("SELECT data FROM events WHERE subject_id = 'steam-test' AND action = 'updated'").all()).toStrictEqual([
    {
      data: JSON.stringify({
        task: 'Run the steam test',
        done_when: [
          { kind: 'issue', ref: 'KET-7' },
          { kind: 'doc', ref: 'abc123def456' },
        ],
      }),
    },
  ]);
});

test('it starts a reopened item with only the conditions given', () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });
  closeUnblock(ctx.db, 'steam-test', 'done', null, 'kettle-triage');

  const reopened = addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test again', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage' });

  expect(reopened.result).toBe('reopened');
  expect(reopened.item.done_when).toStrictEqual([]);
});
