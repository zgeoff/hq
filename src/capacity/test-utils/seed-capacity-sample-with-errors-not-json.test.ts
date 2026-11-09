import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedCapacitySampleWithErrorsNotJSON } from './seed-capacity-sample-with-errors-not-json.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readSamples: () => fresh.db.query('SELECT at, nonnix_awake_mib, errors FROM capacity_samples').all() };
}

test('#seedCapacitySampleWithErrorsNotJSON stores a sample whose errors column is not JSON, and input overrides apply', async () => {
  const ctx = setupTest();

  await seedCapacitySampleWithErrorsNotJSON(ctx, { at: '2026-10-14T00:00:00Z', nonnix_awake_mib: 0 });

  expect(ctx.readSamples()).toStrictEqual([{ at: '2026-10-14T00:00:00Z', nonnix_awake_mib: 0, errors: '{oops' }]);
});
