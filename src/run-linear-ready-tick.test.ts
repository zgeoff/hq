import { expect, jest, mock, onTestFinished, test } from 'bun:test';
import { setImmediate } from 'node:timers/promises';
import { buildHeldLinearCall } from '../test/build-held-linear-call.ts';
import { buildStubClock } from '../test/build-stub-clock.ts';
import { buildStubGitHubFactsRunner } from '../test/build-stub-github-facts-runner.ts';
import { buildReadyPage, makePagedCall } from '../test/build-ready-page.ts';
import { makeBacklogCall } from '../test/make-backlog-call.ts';
import { buildMockLaneConfig } from '../test/build-mock-lane-config.ts';
import { at, freshDb } from '../test/helpers.ts';
import { getMeta } from './db/get-meta.ts';
import { runFocusCommand } from './focus/run-focus-command.ts';
import { makeStateCall } from '../test/make-state-call.ts';
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

  await expect(runLinearReadyTick(ctx.db, { call: bad, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 })).rejects.toThrow('invented outage');

  expect(getMeta(ctx.db, 'lanes_ready_linear_at')).toBe('2026-10-15T20:00:00Z');
  expect(getMeta(ctx.db, 'lanes_ready_linear_error')).toBe('Linear answered 502: invented outage');
});

test('it clears the recorded error after a good read', async () => {
  const ctx = setupTest();
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  await runLinearReadyTick(ctx.db, { call: makePagedCall(new Error('Linear answered 502: invented outage')), run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 }).catch(() => null);
  at('2026-10-15T20:10:00Z');

  const recovered = await runLinearReadyTick(ctx.db, { call: makePagedCall(buildReadyPage([], null)), run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });

  expect(recovered).toBe(true);
  expect(getMeta(ctx.db, 'lanes_ready_linear_error')).toBeNull();
});

test('it runs no second pass within 10 min', async () => {
  const ctx = setupTest();
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  const call = mock<LinearCall>(() => Promise.resolve(buildReadyPage([], null)));

  await runLinearReadyTick(ctx.db, { call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });
  at('2026-10-15T20:09:00Z');
  const second = await runLinearReadyTick(ctx.db, { call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });
  at('2026-10-15T20:10:00Z');
  const third = await runLinearReadyTick(ctx.db, { call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });

  expect(second).toBe(false);
  expect(third).toBe(true);
  expect(call).toHaveBeenCalledTimes(4);
});

test('it records a missed deadline as the error', async () => {
  const ctx = setupTest();
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));

  const failure = await runLinearReadyTick(ctx.db, { call: () => new Promise(() => {}), run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 20 }).then(
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
  await runLinearReadyTick(ctx.db, { call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 20 }).catch(() => null);

  late.resolve(buildReadyPage([{ identifier: 'GEO-1', project: 'atc roadmap' }], null));

  // Every microtask of the abandoned read has run once the next macrotask starts.
  await setImmediate();

  expect(getMeta(ctx.db, 'lanes_ready_by_lane')).toBeNull();
});

test('it records a failed pacing read as the error and asks Linear nothing', async () => {
  const ctx = setupTest();
  const call = mock<LinearCall>(() => Promise.resolve(buildReadyPage([], null)));

  await expect(runLinearReadyTick(ctx.db, { call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.reject(new Error("can't read invented pacing.json")), actor: 'hq-lanes', deadlineMs: 2000 })).rejects.toThrow('invented pacing.json');

  expect(getMeta(ctx.db, 'lanes_ready_linear_error')).toBe("can't read invented pacing.json");
  expect(call).not.toHaveBeenCalled();
});

test('it reads Ready when pacing.json gives only slot caps and names no lanes', async () => {
  const ctx = setupTest();
  const call = mock<LinearCall>(() => Promise.resolve(buildReadyPage([{ identifier: 'GEO-9801' }], null)));

  const read = await runLinearReadyTick(ctx.db, { call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(null), actor: 'hq-lanes', deadlineMs: 2000 });

  expect([read, getMeta(ctx.db, 'lanes_ready_linear_error')]).toStrictEqual([true, null]);
});

test('it counts every promotable Backlog issue while no focus is set', async () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  const call = makeBacklogCall([
    { identifier: 'GEO-9901', project: 'kettle roadmap', type: 'Feature' },
    { identifier: 'GEO-9902', project: 'kettle roadmap', type: 'Bug', labels: ['parked'] },
    { identifier: 'GEO-9903', project: 'kettle roadmap', type: 'Bug' },
  ]);

  await runLinearReadyTick(ctx.db, { call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });

  expect(getMeta(ctx.db, 'lanes_promotable_focus')).toBe('{"at":"2026-10-15T20:00:00Z","count":2,"focus":"[]","error":null}');
});

test('it counts only the promotable Backlog issues a focus term matches', async () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['bug'], reserves: [] });
  const call = makeBacklogCall([
    { identifier: 'GEO-9901', project: 'kettle roadmap', type: 'Feature' },
    { identifier: 'GEO-9903', project: 'kettle roadmap', type: 'Bug' },
  ]);

  await runLinearReadyTick(ctx.db, { call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });

  expect(getMeta(ctx.db, 'lanes_promotable_focus')).toBe(String.raw`{"at":"2026-10-15T20:00:00Z","count":1,"focus":"[\"bug\"]","error":null}`);
});

test('it records an unknown count, never none, when the Backlog read fails', async () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  const call = makeBacklogCall('outage');

  const ran = await runLinearReadyTick(ctx.db, { call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 2000 });

  expect(ran).toBe(true);
  expect(getMeta(ctx.db, 'lanes_promotable_focus')).toBe('{"at":"2026-10-15T20:00:00Z","count":null,"focus":"[]","error":"Linear answered 502: invented outage"}');
  expect(getMeta(ctx.db, 'lanes_ready_linear_error')).toBeNull();
});

test('it records an unknown count when the Backlog read misses the deadline the Ready read started', async () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  const call = makeBacklogCall('silent');

  const ran = await runLinearReadyTick(ctx.db, { call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 200 });

  expect(ran).toBe(true);
  expect(getMeta(ctx.db, 'lanes_promotable_focus')).toBe('{"at":"2026-10-15T20:00:00Z","count":null,"focus":"[]","error":"Backlog promotable count did not finish in 0 s"}');
  expect(getMeta(ctx.db, 'lanes_ready_linear_error')).toBeNull();
});

test('it records an unknown count when the Backlog read answers within a fresh deadline but after the one the Ready read started', async () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  const lanes = ['nixie-slice', 'nixie-maintenance', 'atc', 'imp', 'cloud', 'memory', 'flexible', 'cleanup', 'process'].map((name) => buildMockLaneConfig(name));
  jest.useFakeTimers();
  onTestFinished(() => jest.useRealTimers());
  const clock = buildStubClock(0);
  const held = buildHeldLinearCall();
  const ran = runLinearReadyTick(ctx.db, { call: held.call, run: buildStubGitHubFactsRunner({}), readLanes: () => Promise.resolve(lanes), actor: 'hq-lanes', deadlineMs: 100, now: clock.now });

  clock.sleep(60);
  jest.advanceTimersByTime(60);
  held.ready.resolve(buildReadyPage([], null));
  await held.backlogAsked;
  clock.sleep(70);
  jest.advanceTimersByTime(70);
  held.backlog.resolve({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
  const read = await ran;

  expect(read).toBe(true);
  expect(getMeta(ctx.db, 'lanes_promotable_focus')).toBe('{"at":"2026-10-15T20:00:00Z","count":null,"focus":"[]","error":"Backlog promotable count did not finish in 0 s"}');
});
