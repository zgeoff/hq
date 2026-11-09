import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readUsageSamples } from './read-usage-samples.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, seed: buildSeeder(fresh) };
}

test("it reads the current account's samples of the last 2 hours, oldest first", () => {
  const ctx = setupTest();
  ctx.seed.usageSample({ at: '2026-10-14T00:20:00Z', account: 'kettle01', five_hour: 5, seven_day: 20, five_hour_resets_at: null, seven_day_resets_at: null });
  ctx.seed.usageSample({ at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: 6, seven_day: 21, five_hour_resets_at: '2026-10-14T06:00:00Z', seven_day_resets_at: '2026-10-20T00:00:00Z' });
  ctx.seed.usageSample({ at: '2026-10-14T01:45:00Z', account: 'teapot02', five_hour: 50, seven_day: 60, five_hour_resets_at: null, seven_day_resets_at: null });
  ctx.seed.usageSample({ at: '2026-10-14T02:30:00Z', account: 'kettle01', five_hour: 7, seven_day: 22, five_hour_resets_at: null, seven_day_resets_at: null });

  const samples = readUsageSamples(ctx.db, new Date('2026-10-14T02:30:00Z'), 2);

  expect(samples.map((sample) => sample.at)).toStrictEqual(['2026-10-14T01:30:00Z', '2026-10-14T02:30:00Z']);
  expect(samples[0]).toStrictEqual({ at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: 6, seven_day: 21, five_hour_resets_at: '2026-10-14T06:00:00Z', seven_day_resets_at: '2026-10-20T00:00:00Z' });
});

test('it reads no samples when none exist', () => {
  const ctx = setupTest();

  expect(readUsageSamples(ctx.db, new Date('2026-10-14T02:30:00Z'), 2)).toStrictEqual([]);
});
