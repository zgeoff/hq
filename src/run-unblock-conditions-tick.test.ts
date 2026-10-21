import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../test/helpers.ts';
import { runUnblockConditionsTick } from './run-unblock-conditions-tick.ts';

// No open item has a subject link or a condition, so the pass never calls gh or Linear.
function setupTest() {
  at(NOON_SYDNEY);
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    deps: {
      run: () => Promise.resolve({ code: 1, stdout: '', stderr: 'invented: not called' }),
      call: () => Promise.reject(new Error('invented: Linear not called')),
    },
  };
}

test('it runs the first pass', async () => {
  const ctx = setupTest();

  const outcome = await runUnblockConditionsTick(ctx.db, ctx.deps, 'kettle-bot', new Date('2026-10-14T01:00:00Z'));

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [] });
});

test('it skips a pass 9 min after the last one', async () => {
  const ctx = setupTest();
  await runUnblockConditionsTick(ctx.db, ctx.deps, 'kettle-bot', new Date('2026-10-14T01:00:00Z'));

  const outcome = await runUnblockConditionsTick(ctx.db, ctx.deps, 'kettle-bot', new Date('2026-10-14T01:09:00Z'));

  expect(outcome).toBeNull();
});

test('it runs a pass 10 min after the last one', async () => {
  const ctx = setupTest();
  await runUnblockConditionsTick(ctx.db, ctx.deps, 'kettle-bot', new Date('2026-10-14T01:00:00Z'));

  const outcome = await runUnblockConditionsTick(ctx.db, ctx.deps, 'kettle-bot', new Date('2026-10-14T01:10:00Z'));

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [] });
});
