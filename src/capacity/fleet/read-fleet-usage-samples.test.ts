import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { readFleetUsageSamples } from './read-fleet-usage-samples.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test("it reads every account's samples of the window, oldest first", () => {
  const ctx = setupTest();
  const insert = ctx.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at) VALUES (?, ?, ?, ?, ?, ?)');
  insert.run('2026-10-14T00:20:00Z', 'kettle01', 5, 20, null, null);
  insert.run('2026-10-14T01:30:00Z', 'kettle01', 6, 21, '2026-10-14T06:00:00Z', '2026-10-20T00:00:00Z');
  insert.run('2026-10-14T01:45:00Z', 'teapot02', 50, 60, null, null);
  insert.run('2026-10-14T02:30:00Z', 'kettle01', 7, 22, null, null);
  insert.run('2026-10-14T02:40:00Z', 'teapot02', 51, 61, null, null);

  const samples = readFleetUsageSamples(ctx.db, new Date('2026-10-14T02:30:00Z'), 2);

  expect(samples).toStrictEqual([
    { at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: 6, seven_day: 21, five_hour_resets_at: '2026-10-14T06:00:00Z', seven_day_resets_at: '2026-10-20T00:00:00Z' },
    { at: '2026-10-14T01:45:00Z', account: 'teapot02', five_hour: 50, seven_day: 60, five_hour_resets_at: null, seven_day_resets_at: null },
    { at: '2026-10-14T02:30:00Z', account: 'kettle01', five_hour: 7, seven_day: 22, five_hour_resets_at: null, seven_day_resets_at: null },
  ]);
});
