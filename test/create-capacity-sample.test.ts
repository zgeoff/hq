import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { latestSample } from '../src/capacity/latest-sample.ts';
import { createCapacitySample } from './create-capacity-sample.ts';
import { freshDb } from './helpers.ts';

function setupTest(): Database {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test('seeded capacity samples read back as the watch reads its newest one, a later one at the same time replacing an earlier', async () => {
  const db = createCapacitySample(
      setupTest(),
      { at: '2026-10-16T01:00:00Z', nonnixAwakeMib: 8192 },
      { at: '2026-10-16T01:05:00Z', nonnixAwakeMib: 14_336 },
      { at: '2026-10-16T01:05:00Z', nonnixAwakeMib: 16_384 },
    ),
    newest = await latestSample(db);
  expect(newest).toMatchObject({ at: '2026-10-16T01:05:00Z', nonnix_awake_mib: 16_384, impd_budget_mib: null, errors: {} });
  expect(db.query('SELECT COUNT(*) AS n FROM capacity_samples').get()).toStrictEqual({ n: 2 });
});
