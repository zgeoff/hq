import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addUnblock } from './add-unblock.ts';
import { closeUnblock } from './close-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it tells each notify session but the closer that the owner did the item', () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test', minutes: null, unblocks: [{ issue: 'KET-7', priority: 'high' }], notify: ['kettle-session', 'kettle-triage'], actor: 'kettle-triage' });

  closeUnblock(ctx.db, 'steam-test', 'done', 'it held', 'kettle-triage');

  expect(ctx.db.query('SELECT target, text FROM outbox').all()).toStrictEqual([{ target: 'kettle-session', text: 'The owner did "Run the steam test" (it held). That unblocks KET-7. Carry on.' }]);
});

test('it tells nobody when the item is dropped', () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'steam-test', task: 'Run the steam test', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage' });

  closeUnblock(ctx.db, 'steam-test', 'dropped', null, 'kettle-triage');

  expect(ctx.db.query('SELECT target, text FROM outbox').all()).toStrictEqual([]);
});
