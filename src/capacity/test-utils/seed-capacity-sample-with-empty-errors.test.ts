import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedCapacitySampleWithEmptyErrors } from './seed-capacity-sample-with-empty-errors.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readSamples: () => fresh.db.query('SELECT at, nonnix_awake_mib, errors FROM capacity_samples').all() };
}

test('#seedCapacitySampleWithEmptyErrors stores a sample with an empty errors column, and input overrides apply', async () => {
  const ctx = setupTest();

  await seedCapacitySampleWithEmptyErrors(ctx, { at: '2026-10-14T00:00:00Z', nonnix_awake_mib: 0 });

  expect(ctx.readSamples()).toStrictEqual([{ at: '2026-10-14T00:00:00Z', nonnix_awake_mib: 0, errors: '' }]);
});
