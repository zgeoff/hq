import { expect, onTestFinished, test } from 'bun:test';
import { buildStubImpzRunner } from '../../test/build-stub-impz-runner.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { latestSample } from './latest-sample.ts';
import { readCapacity } from './read-capacity.ts';
import { writeCapacitySample } from './write-capacity-sample.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test('it stores the RAM impd keeps for priority imps with the sample', async () => {
  const db = setupTest();
  at('2026-10-16T01:00:00Z');
  const run = buildStubImpzRunner({
    info: { ramBudgetMib: 20_480, ramUsedMib: 12_288, ramCommittedMib: 14_336, ramPriorityKeptMib: 3072 },
    imps: [
      { name: 'nixie-a', state: 'running', memoryMib: 1024, vcpus: 1 },
      { name: 'kettle-1', state: 'running', memoryMib: 2048, vcpus: 2 },
    ],
  });
  const reading = await readCapacity(db, { run, readText: () => Promise.resolve(''), readFile: () => Promise.resolve(''), readMs: 100 });

  await writeCapacitySample(db, reading);

  const stored = await latestSample(db);
  expect(stored).toMatchObject({ impd_budget_mib: 20_480, impd_priority_kept_mib: 3072, nonnix_awake_mib: 2048, nix_awake_mib: 1024 });
});
