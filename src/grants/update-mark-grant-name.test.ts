import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { addMark } from '../marks/add-mark.ts';
import { createGrantMark } from './create-grant-mark.ts';
import { recordGrantAction } from './record-grant-action.ts';
import { updateMarkGrantName } from './update-mark-grant-name.ts';

function setupTest(): Database {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test('a grant mark recorded before names takes one, and can be renamed until an action uses it', () => {
  const db = setupTest(),
    mark = addMark(db, { kind: 'grant', text: 'kettle PRs merge on green CI', ref: null, at: null, actor: 'kettle-bot' });
  expect(updateMarkGrantName(db, { id: mark.id, name: 'kettle-merge', actor: 'kettle-bot' }).grant_name).toBe('kettle-merge');
  expect(updateMarkGrantName(db, { id: mark.id, name: 'kettle-merges', actor: 'kettle-bot' }).grant_name).toBe('kettle-merges');
  recordGrantAction(db, { grant: 'kettle-merges', target: 'kettle#9', note: null, actor: 'teapot-bot' });
  expect(() => updateMarkGrantName(db, { id: mark.id, name: 'kettle-ships', actor: 'kettle-bot' })).toThrow('grant kettle-merges has actions recorded; it keeps its name');
  expect(updateMarkGrantName(db, { id: mark.id, name: 'kettle-merges', actor: 'kettle-bot' }).grant_name).toBe('kettle-merges');
});

test('a name is refused on another kind of mark, on a missing mark, when taken, or when not a slug', () => {
  const db = setupTest(),
    grant = createGrantMark(db, { text: 'kettle PRs merge on green CI', ref: null, at: null, name: 'kettle-merges', actor: 'kettle-bot' }),
    other = addMark(db, { kind: 'grant', text: 'teapot deploys', ref: null, at: null, actor: 'kettle-bot' }),
    skills = addMark(db, { kind: 'skills', text: 'kettle skill', ref: null, at: null, actor: 'kettle-bot' });
  expect(() => updateMarkGrantName(db, { id: skills.id, name: 'kettle-skill', actor: 'kettle-bot' })).toThrow(`mark ${skills.id} is a skills mark; only a grant mark takes a name`);
  expect(() => updateMarkGrantName(db, { id: 999, name: 'kettle-skill', actor: 'kettle-bot' })).toThrow('no mark 999');
  expect(() => updateMarkGrantName(db, { id: other.id, name: 'kettle-merges', actor: 'kettle-bot' })).toThrow(`mark ${grant.id} already has the grant name kettle-merges`);
  expect(() => updateMarkGrantName(db, { id: other.id, name: 'teapot--deploys', actor: 'kettle-bot' })).toThrow('a grant name must be a slug');
});
