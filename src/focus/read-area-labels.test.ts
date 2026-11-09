import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { seedAreaLabels } from './test-utils/seed-area-labels.ts';
import { FOCUS_AREAS } from './focus-areas.ts';
import { readAreaLabels } from './read-area-labels.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it falls back to the built-in areas while no read of Linear is stored', () => {
  const ctx = setupTest();

  expect(readAreaLabels(ctx.db)).toStrictEqual({ at: null, names: [...FOCUS_AREAS], repoExists: {} });
});

test('it reads the stored names instead of the built-in areas once a read is stored', () => {
  const ctx = setupTest();
  seedAreaLabels(ctx, { names: ['teapot'] });

  expect(readAreaLabels(ctx.db).names).toStrictEqual(['teapot']);
});
