import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedLanesSample } from './seed-lanes-sample.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readSamples: () => fresh.db.query('SELECT at, free_mib, slots, eligible, error FROM lanes_samples ORDER BY seq').all() };
}

test('#seedLanesSample stores a sample, and input overrides apply', () => {
  const ctx = setupTest();

  seedLanesSample(ctx, { at: '2026-10-16T01:05:00Z', slots: 2, eligible: 3 });

  expect(ctx.readSamples()).toStrictEqual([{ at: '2026-10-16T01:05:00Z', free_mib: 0, slots: 2, eligible: 3, error: null }]);
});

test('#seedLanesSample keeps each sample in order', () => {
  const ctx = setupTest();

  seedLanesSample(ctx, { at: '2026-10-16T01:00:00Z' });
  seedLanesSample(ctx, { at: '2026-10-16T01:05:00Z' });

  expect(ctx.readSamples()).toHaveLength(2);
});
