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
    );
  const newest = await latestSample(db);
  expect(newest).toMatchObject({ at: '2026-10-16T01:05:00Z', nonnix_awake_mib: 16_384, nix_awake_mib: 0, impd_budget_mib: 1_048_576, impd_priority_kept_mib: 0, errors: {} });
  expect(db.query('SELECT COUNT(*) AS n FROM capacity_samples').get()).toStrictEqual({ n: 2 });
});

test('it seeds the impd budget, the awake Nix imps and the RAM kept for priority imps', async () => {
  const db = createCapacitySample(setupTest(), { at: '2026-10-16T01:00:00Z', nonnixAwakeMib: 8192, nixAwakeMib: 1024, impdBudgetMib: 20_480, impdPriorityKeptMib: 3072 });

  const newest = await latestSample(db);

  expect(newest).toMatchObject({ nix_awake_mib: 1024, impd_budget_mib: 20_480, impd_priority_kept_mib: 3072 });
});
