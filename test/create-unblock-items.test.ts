import { expect, onTestFinished, test } from 'bun:test';
import { getUnblock } from '../src/unblock/get-unblock.ts';
import { createUnblockItems } from './create-unblock-items.ts';
import { freshDb } from './helpers.ts';

test('it files open items, with the console fields only when links are given', () => {
  const env = freshDb(),
    links = [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true as const }],
    seeded = createUnblockItems(env.db, { linked: { task: 'Review kettle#4', links }, plain: { task: 'Run the steam test' } });
  onTestFinished(env.cleanup);

  expect(getUnblock(seeded, 'linked')).toMatchObject({ state: 'open', task: 'Review kettle#4', notify: ['kettle-session'], added_by: 'kettle-triage' });
  expect(JSON.parse(getUnblock(seeded, 'linked')?.item ?? '{}')).toStrictEqual({ details: [], unblocks: [], links });
  expect(getUnblock(seeded, 'plain')?.item).toBeNull();
});

test('it files the conditions of an item that has them', () => {
  const env = freshDb();
  const seeded = createUnblockItems(env.db, { waiting: { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-1' }] }, plain: { task: 'Descale the kettle' } });
  onTestFinished(env.cleanup);

  expect(getUnblock(seeded, 'waiting')?.done_when).toStrictEqual([{ kind: 'issue', ref: 'KET-1' }]);
  expect(getUnblock(seeded, 'plain')?.done_when).toStrictEqual([]);
});
