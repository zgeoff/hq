import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import { freshDb } from '../../test/helpers.ts';
import { readLanesSamples } from './read-lanes-samples.ts';
import { tick } from './tick.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it reads every lanes sample, oldest first', () => {
  const ctx = setupTest();
  updateEnv('HQ_NOW', '2026-10-22T01:00:00Z');
  tick(ctx.db, { cap: null, impMib: 2048, error: 'impd answered 500' }, 'hq-lanes');
  updateEnv('HQ_NOW', '2026-10-22T01:05:00Z');
  tick(ctx.db, { cap: null, impMib: 2048, error: 'impd timed out' }, 'hq-lanes');

  expect(readLanesSamples(ctx.db)).toStrictEqual([
    { seq: 1, at: '2026-10-22T01:00:00Z', free_mib: null, slots: 0, eligible: null, error: 'impd answered 500' },
    { seq: 2, at: '2026-10-22T01:05:00Z', free_mib: null, slots: 0, eligible: null, error: 'impd timed out' },
  ]);
});

test('it reads no rows before the first tick', () => {
  const ctx = setupTest();

  expect(readLanesSamples(ctx.db)).toStrictEqual([]);
});
