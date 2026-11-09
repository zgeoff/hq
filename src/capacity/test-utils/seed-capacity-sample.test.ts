import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedCapacitySample } from './seed-capacity-sample.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readSamples: () => fresh.db.query('SELECT at, nonnix_awake_mib, nonnix_awake_vcpus, op_account_used, errors FROM capacity_samples').all() };
}

test('#seedCapacitySample stores a sample, and input overrides apply', async () => {
  const ctx = setupTest();

  await seedCapacitySample(ctx, { at: '2026-10-15T00:58:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: 6 });

  expect(ctx.readSamples()).toStrictEqual([{ at: '2026-10-15T00:58:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: 6, op_account_used: null, errors: '{}' }]);
});

test('#seedCapacitySample replaces the sample a time already holds', async () => {
  const ctx = setupTest();
  await seedCapacitySample(ctx, { nonnix_awake_mib: 1 });

  await seedCapacitySample(ctx, { nonnix_awake_mib: 2 });

  expect(ctx.readSamples()).toMatchObject([{ nonnix_awake_mib: 2 }]);
});
