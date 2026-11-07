import { expect, onTestFinished, test } from 'bun:test';
import { buildStubImpzRunner } from '../../test/build-stub-impz-runner.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { seedCapacitySampleErrors } from '../test-utils/seed-capacity-sample-errors.ts';
import { readCapacity } from './read-capacity.ts';
import { sampleLog } from './sample-log.ts';
import { writeCapacitySample } from './write-capacity-sample.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readLog: () => sampleLog(fresh.db, 1, new Date('2026-10-14T00:30:00Z')) };
}

test('it reads the errors a sample stored', async () => {
  const ctx = setupTest();
  at('2026-10-14T00:00:00Z');
  const run = buildStubImpzRunner({ info: { ramBudgetMib: 20_480, ramUsedMib: 0, ramCommittedMib: 0, ramPriorityKeptMib: 0 }, imps: [] });
  const reading = await readCapacity(ctx.db, { run, readText: () => Promise.resolve(''), readFile: () => Promise.resolve(''), readMs: 100 });
  await writeCapacitySample(ctx.db, { ...reading, errors: { cloud: 'timed out' } });

  const log = await ctx.readLog();

  expect(log.map((sample) => sample.errors)).toStrictEqual([{ cloud: 'timed out' }]);
});

test('it reads an empty errors column as no errors', async () => {
  const ctx = setupTest();
  seedCapacitySampleErrors(ctx.db, '2026-10-14T00:00:00Z', 'empty');

  const log = await ctx.readLog();

  expect(log.map((reading) => reading.errors)).toStrictEqual([{}]);
});

test.each([
  { state: 'text that is not JSON' as const },
  { state: 'an error that is not text' as const },
])('it rejects a sample whose errors column holds $state', async (row) => {
  const ctx = setupTest();
  seedCapacitySampleErrors(ctx.db, '2026-10-14T00:00:00Z', row.state);

  await expect(ctx.readLog()).rejects.toThrow();
});
