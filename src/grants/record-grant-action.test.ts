import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { dropMark } from '../marks/drop-mark.ts';
import { createGrantMark } from './create-grant-mark.ts';
import { recordGrantAction } from './record-grant-action.ts';

function setupTest(): Database {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test('an action under a named grant is recorded with its target, note and actor', () => {
  const db = setupTest();
  createGrantMark(db, { text: 'kettle PRs merge on green CI', ref: 'kettle#3', at: null, name: 'kettle-merges', actor: 'kettle-bot' });

  expect(recordGrantAction(db, { grant: 'kettle-merges', target: 'kettle#9', note: ' merged on green ', actor: 'teapot-bot' })).toStrictEqual({ id: 1, grant_name: 'kettle-merges', target: 'kettle#9', note: 'merged on green', actor: 'teapot-bot', at: NOON_SYDNEY });
  expect(recordGrantAction(db, { grant: 'kettle-merges', target: 'kettle#10', note: '', actor: 'teapot-bot' }).note).toBeNull();
});

test('an unknown grant name is refused with the names that exist, and so is a blank target', () => {
  const db = setupTest();
  expect(() => recordGrantAction(db, { grant: 'kettle-merges', target: 'kettle#9', note: null, actor: 'teapot-bot' })).toThrow('no grant named kettle-merges; named grants: none (name one with hq mark grant ID NAME)');
  createGrantMark(db, { text: 'kettle PRs merge on green CI', ref: null, at: null, name: 'kettle-merges', actor: 'kettle-bot' });
  expect(() => recordGrantAction(db, { grant: 'kettle-merge', target: 'kettle#9', note: null, actor: 'teapot-bot' })).toThrow('no grant named kettle-merge; named grants: kettle-merges');
  expect(() => recordGrantAction(db, { grant: 'kettle-merges', target: '  ', note: null, actor: 'teapot-bot' })).toThrow('--target must be one line');
});

test('a grant mark takes a unique slug name, a refused name leaves no mark behind, and a named grant with actions cannot be dropped', () => {
  const db = setupTest(),
    mark = createGrantMark(db, { text: 'kettle PRs merge on green CI', ref: null, at: null, name: 'kettle-merges', actor: 'kettle-bot' });
  expect(() => createGrantMark(db, { text: 'kettle', ref: null, at: null, name: 'Kettle Merges', actor: 'kettle-bot' })).toThrow('a grant name must be a slug');
  expect(() => createGrantMark(db, { text: 'again', ref: null, at: null, name: 'kettle-merges', actor: 'kettle-bot' })).toThrow('mark 1 already has the grant name kettle-merges');
  expect(db.query('SELECT COUNT(*) AS n FROM marks').get()).toStrictEqual({ n: 1 });
  recordGrantAction(db, { grant: 'kettle-merges', target: 'kettle#9', note: null, actor: 'teapot-bot' });
  expect(() => dropMark(db, mark.id, 'kettle-bot')).toThrow(`mark ${mark.id} is grant kettle-merges, with actions recorded under it; it stays`);
});
