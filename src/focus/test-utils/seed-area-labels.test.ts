import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { readAreaLabels } from '../read-area-labels.ts';
import { seedAreaLabels } from './seed-area-labels.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('#seedAreaLabels stores the names and the repo checks for the reader, and input overrides apply', () => {
  const ctx = setupTest();

  seedAreaLabels(ctx, { names: ['teapot', 'kettle'], repoExists: { teapot: true } });

  expect(readAreaLabels(ctx.db)).toStrictEqual({ at: '2026-10-15T19:00:00Z', names: ['teapot', 'kettle'], repoExists: { teapot: true } });
});

test('#seedAreaLabels replaces the labels a former seed stored', () => {
  const ctx = setupTest();
  seedAreaLabels(ctx, { names: ['teapot'] });

  seedAreaLabels(ctx, { names: ['kettle'], at: '2026-10-16T19:00:00Z' });

  expect(readAreaLabels(ctx.db)).toStrictEqual({ at: '2026-10-16T19:00:00Z', names: ['kettle'], repoExists: {} });
});
