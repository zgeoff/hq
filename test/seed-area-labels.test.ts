import { expect, onTestFinished, test } from 'bun:test';
import { readAreaLabels } from '../src/focus/read-area-labels.ts';
import { freshDb } from './helpers.ts';
import { seedAreaLabels } from './seed-area-labels.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it stores the names and the repo checks for the reader', () => {
  const ctx = setupTest();

  seedAreaLabels(ctx.db, ['teapot', 'kettle'], { teapot: true });

  expect(readAreaLabels(ctx.db)).toStrictEqual({ at: '2026-10-15T19:00:00Z', names: ['teapot', 'kettle'], repoExists: { teapot: true } });
});
