import { expect, mock, onTestFinished, test } from 'bun:test';
import { setImmediate } from 'node:timers/promises';
import { buildReadyPage, makePagedCall } from '../test/build-ready-page.ts';
import { buildMockLaneConfig } from '../test/build-mock-lane-config.ts';
import { at, freshDb } from '../test/helpers.ts';
import { getMeta } from './db/get-meta.ts';
import type { LinearCall } from './linear/types.ts';
import { runLinearReadyTick } from './run-linear-ready-tick.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-15T20:00:00Z');
  return { db: fresh.db };
}

test('it records the error and sets the throttle when the read throws', async () => {
  const ctx = setupTest();
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  const bad = makePagedCall(new Error('Linear answered 502: invented outage'));

  await expect(runLinearReadyTick(ctx.db, { call: bad, readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 })).rejects.toThrow('invented outage');

  expect(getMeta(ctx.db, 'lanes_ready_linear_at')).toBe('2026-10-15T20:00:00Z');
  expect(getMeta(ctx.db, 'lanes_ready_linear_error')).toBe('Linear answered 502: invented outage');
});

test('it clears the recorded error after a good read', async () => {
  const ctx = setupTest();
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  await runLinearReadyTick(ctx.db, { call: makePagedCall(new Error('Linear answered 502: invented outage')), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 }).catch(() => null);
  at('2026-10-15T20:10:00Z');

  const recovered = await runLinearReadyTick(ctx.db, { call: makePagedCall(buildReadyPage([], null)), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });

  expect(recovered).toBe(true);
  expect(getMeta(ctx.db, 'lanes_ready_linear_error')).toBeNull();
});

test('it runs no second pass within 10 min', async () => {
  const ctx = setupTest();
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  const call = mock<LinearCall>(() => Promise.resolve(buildReadyPage([], null)));

  await runLinearReadyTick(ctx.db, { call, readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });
  at('2026-10-15T20:09:00Z');
  const second = await runLinearReadyTick(ctx.db, { call, readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });
  at('2026-10-15T20:10:00Z');
  const third = await runLinearReadyTick(ctx.db, { call, readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });

  expect(second).toBe(false);
  expect(third).toBe(true);
  expect(call).toHaveBeenCalledTimes(2);
});

test('it records a missed deadline as the error', async () => {
  const ctx = setupTest();
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));

  const failure = await runLinearReadyTick(ctx.db, { call: () => new Promise(() => {}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 20 }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ code: 'timed_out' });

  expect(getMeta(ctx.db, 'lanes_ready_linear_error')).toBe('lanes Ready from Linear did not finish in 0 s');
});

test('it writes no counts when a read answers after its deadline', async () => {
  const ctx = setupTest();
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  const late = Promise.withResolvers<unknown>();
  const call: LinearCall = () => late.promise;
  await runLinearReadyTick(ctx.db, { call, readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 20 }).catch(() => null);

  late.resolve(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], null));

  // Every microtask of the abandoned read has run once the next macrotask starts.
  await setImmediate();

  expect(getMeta(ctx.db, 'lanes_ready_by_lane')).toBeNull();
});

test('it records a failed pacing read as the error and asks Linear nothing', async () => {
  const ctx = setupTest();
  const call = mock<LinearCall>(() => Promise.resolve(buildReadyPage([], null)));

  await expect(runLinearReadyTick(ctx.db, { call, readLanes: () => Promise.reject(new Error("can't read invented pacing.json")), actor: 'hq-lanes', deadlineMs: 2000 })).rejects.toThrow('invented pacing.json');

  expect(getMeta(ctx.db, 'lanes_ready_linear_error')).toBe("can't read invented pacing.json");
  expect(call).not.toHaveBeenCalled();
});

test('it reads Ready when pacing.json gives only slot caps and names no lanes', async () => {
  const ctx = setupTest();
  const call = mock<LinearCall>(() => Promise.resolve(buildReadyPage([{ identifier: 'GEO-9801' }], null)));

  const read = await runLinearReadyTick(ctx.db, { call, readLanes: () => Promise.resolve(null), actor: 'hq-lanes', deadlineMs: 2000 });

  expect([read, getMeta(ctx.db, 'lanes_ready_linear_error')]).toStrictEqual([true, null]);
});
