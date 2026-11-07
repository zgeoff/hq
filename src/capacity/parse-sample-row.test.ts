import { expect, onTestFinished, test } from 'bun:test';
import { createCapacitySample } from '../../test/create-capacity-sample.ts';
import { freshDb } from '../../test/helpers.ts';
import { sampleLog } from './sample-log.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  createCapacitySample(fresh.db, { at: '2026-10-14T00:00:00Z', nonnixAwakeMib: 0 });
  return { db: fresh.db, readLog: () => sampleLog(fresh.db, 1, new Date('2026-10-14T00:30:00Z')) };
}

test('it reads the errors a sample stored', async () => {
  const ctx = setupTest();
  ctx.db.run(`UPDATE capacity_samples SET errors = '{"cloud":"timed out"}'`);

  const log = await ctx.readLog();

  expect(log.map((reading) => reading.errors)).toStrictEqual([{ cloud: 'timed out' }]);
});

test('it reads an empty errors column as no errors', async () => {
  const ctx = setupTest();
  ctx.db.run(`UPDATE capacity_samples SET errors = ''`);

  const log = await ctx.readLog();

  expect(log.map((reading) => reading.errors)).toStrictEqual([{}]);
});

test('it rejects a sample whose errors column is not JSON', async () => {
  const ctx = setupTest();
  ctx.db.run(`UPDATE capacity_samples SET errors = '{oops'`);

  await expect(ctx.readLog()).rejects.toThrow();
});

test('it rejects a sample whose errors column holds a value that is not text', async () => {
  const ctx = setupTest();
  ctx.db.run(`UPDATE capacity_samples SET errors = '{"cloud":4}'`);

  await expect(ctx.readLog()).rejects.toThrow();
});
