import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedUsageSample } from './seed-usage-sample.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readSamples: () => fresh.db.query('SELECT at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at FROM usage_samples').all() };
}

test('#seedUsageSample stores a sample, and input overrides apply', () => {
  const ctx = setupTest();

  seedUsageSample(ctx, { at: '2026-10-15T00:00:00Z', five_hour: 30, seven_day: 98, seven_day_resets_at: '2026-10-18T00:00:00Z' });

  expect(ctx.readSamples()).toStrictEqual([{ at: '2026-10-15T00:00:00Z', account: 'abcdef012345', five_hour: 30, seven_day: 98, five_hour_resets_at: null, seven_day_resets_at: '2026-10-18T00:00:00Z' }]);
});

test('#seedUsageSample refuses a second sample for the same account and time', () => {
  const ctx = setupTest();
  seedUsageSample(ctx, { at: '2026-10-15T00:00:00Z' });

  expect(() => seedUsageSample(ctx, { at: '2026-10-15T00:00:00Z' })).toThrow();
});
