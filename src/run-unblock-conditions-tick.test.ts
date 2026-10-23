import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../test/helpers.ts';
import { runUnblockConditionsTick } from './run-unblock-conditions-tick.ts';
import { addUnblock } from './unblock/add-unblock.ts';

// No open item has a subject link or a condition that reads gh or Linear, so the pass never calls them.
function setupTest() {
  at(NOON_SYDNEY);
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    deps: {
      run: () => Promise.resolve({ code: 1, stdout: '', stderr: 'invented: not called' }),
      call: () => Promise.reject(new Error('invented: Linear not called')),
      ownerSession: 'kettle-owner',
    },
  };
}

test('it runs the first pass', async () => {
  const ctx = setupTest();

  const outcome = await runUnblockConditionsTick(ctx.db, ctx.deps, 'kettle-bot', new Date('2026-10-14T01:00:00Z'));

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
});

test('it checks a date condition at the tick time, not the clock', async () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'steam-date', task: 'Check the steam log', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', doneWhen: [{ kind: 'date', ref: '2026-10-14T03:00:00Z' }] });

  const outcome = await runUnblockConditionsTick(ctx.db, ctx.deps, 'kettle-bot', new Date('2026-10-14T03:05:00Z'));

  expect(outcome).toStrictEqual({ settled: ['steam-date'], dropped: [], errors: [], overdue: [] });
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

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
});
