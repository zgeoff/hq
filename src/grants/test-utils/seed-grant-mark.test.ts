import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedGrantMark } from './seed-grant-mark.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readMarks: () => fresh.db.query('SELECT kind, text, ref, grant_name FROM marks ORDER BY id').all() };
}

test('#seedGrantMark stores a named grant, and input overrides apply', () => {
  const ctx = setupTest();

  seedGrantMark(ctx, { name: 'teapot-merges', ref: 'kettle#3' });

  expect(ctx.readMarks()).toStrictEqual([{ kind: 'grant', text: 'kettle PRs merge on green CI', ref: 'kettle#3', grant_name: 'teapot-merges' }]);
});

test('#seedGrantMark refuses a second grant with the same name', () => {
  const ctx = setupTest();
  seedGrantMark(ctx);

  expect(() => seedGrantMark(ctx)).toThrow();
});
