import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readUsageSamples } from './read-usage-samples.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test("it reads the current account's samples of the last 2 hours, oldest first", () => {
  const ctx = setupTest();
  const insert = ctx.db.query('INSERT INTO usage_samples (at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at) VALUES (?, ?, ?, ?, ?, ?)');
  insert.run('2026-10-14T00:20:00Z', 'kettle01', 5, 20, null, null);
  insert.run('2026-10-14T01:30:00Z', 'kettle01', 6, 21, '2026-10-14T06:00:00Z', '2026-10-20T00:00:00Z');
  insert.run('2026-10-14T01:45:00Z', 'teapot02', 50, 60, null, null);
  insert.run('2026-10-14T02:30:00Z', 'kettle01', 7, 22, null, null);

  const samples = readUsageSamples(ctx.db, new Date('2026-10-14T02:30:00Z'), 2);

  expect(samples.map((sample) => sample.at)).toStrictEqual(['2026-10-14T01:30:00Z', '2026-10-14T02:30:00Z']);
  expect(samples[0]).toStrictEqual({ at: '2026-10-14T01:30:00Z', account: 'kettle01', five_hour: 6, seven_day: 21, five_hour_resets_at: '2026-10-14T06:00:00Z', seven_day_resets_at: '2026-10-20T00:00:00Z' });
});

test('it reads no samples when none exist', () => {
  const ctx = setupTest();

  expect(readUsageSamples(ctx.db, new Date('2026-10-14T02:30:00Z'), 2)).toStrictEqual([]);
});
