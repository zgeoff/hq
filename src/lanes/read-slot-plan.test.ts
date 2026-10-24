import { expect, onTestFinished, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import type { ReadyNodeSeed } from '../../test/build-ready-page.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { makeStateCall } from '../../test/make-state-call.ts';
import { runFocusCommand } from '../focus/run-focus-command.ts';
import { addRun } from '../runs/add-run.ts';
import { setMeta } from '../db/set-meta.ts';
import { setState } from '../runs/set-state.ts';
import { formatSlotPlan } from './format-slot-plan.ts';
import { parseLocalRoom } from './parse-local-room.ts';
import { readLinearReady } from './read-linear-ready.ts';
import { readSlotPlan } from './read-slot-plan.ts';
import { tick } from './tick.ts';
import { validateLaneRules } from './validate-lane-rules.ts';
import { writeLaneSkip } from './write-lane-skip.ts';

// Three local slots and no imp ones, so impd's line plays no part. readySeeds: a kettle team's Ready
// issues; GEO-9805 runs in one local slot already.
function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-15T20:00:00Z');
  const readySeeds: ReadyNodeSeed[] = [
    { identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 },
    { identifier: 'GEO-9802', project: 'kettle roadmap', type: 'Bug', labels: ['vers'], priority: 3 },
    { identifier: 'GEO-9803', project: 'kettle maintenance', projectLabels: ['maintenance'], type: 'Chore', labels: ['cloud'], priority: 4 },
    { identifier: 'GEO-9804', project: 'kettle roadmap', type: 'Feature', labels: ['nixie'], priority: 2 },
    { identifier: 'GEO-9805', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 },
  ];
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  const rules = validateLaneRules(rulesTable, null);
  const seedReady = async (seeds: ReadyNodeSeed[]): Promise<void> => {
    const call = makePagedCall(buildReadyPage(seeds, null));
    await readLinearReady(fresh.db, { call, run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
  };
  const addLocalRun = (issue: string): void => {
    addRun(fresh.db, { issue, title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });
  };
  return { db: fresh.db, readySeeds, sample, seedReady, addLocalRun };
}

test('a focus set changes what the next plan picks, and the running run keeps its slot', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  ctx.addLocalRun('GEO-9805');
  const before = readSlotPlan(ctx.db, ctx.sample);

  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['bug,maintenance'], reserves: ['nixie=1'] });
  const after = readSlotPlan(ctx.db, ctx.sample);

  expect(before?.plan?.picks.map((pick) => pick.issue)).toStrictEqual(['GEO-9801', 'GEO-9804']);
  expect(after?.plan).toStrictEqual({
    picks: [
      { issue: 'GEO-9804', term: null, reserve: 'nixie' },
      { issue: 'GEO-9802', term: 0, reserve: null },
    ],
    lent: [],
  });
  expect([after?.pool.localRunning, after?.pool.localFree, ctx.db.query("SELECT state FROM runs WHERE issue = 'GEO-9805'").get()]).toStrictEqual([1, 2, { state: 'working' }]);
});

test('a reserve its area fills with running runs keeps no slot, read from the areas of the Ready read', async () => {
  const ctx = setupTest();
  await ctx.seedReady([...ctx.readySeeds, { identifier: 'GEO-9806', project: 'kettle roadmap', type: 'Feature', labels: ['nixie'], priority: 2 }]);
  ctx.addLocalRun('GEO-9806');
  at('2026-10-15T20:10:00Z');
  await ctx.seedReady(ctx.readySeeds);

  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:10:00Z'), verb: 'set', rest: ['maintenance'], reserves: ['nixie=1'] });

  expect(readSlotPlan(ctx.db, ctx.sample)?.plan?.picks.map((pick) => pick.issue)).toStrictEqual(['GEO-9802', 'GEO-9803']);
});

test('a reserved slot with nothing eligible in its area is lent to the focus work', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);

  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['bug'], reserves: ['imp=2'] });

  expect(readSlotPlan(ctx.db, ctx.sample)?.plan).toStrictEqual({
    picks: [
      { issue: 'GEO-9802', term: 0, reserve: null },
      { issue: 'GEO-9801', term: null, reserve: null },
      { issue: 'GEO-9805', term: null, reserve: null },
    ],
    lent: [{ area: 'imp', slots: 2 }],
  });
});

test('a closed run still in the Ready read stays out of the picks', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  ctx.addLocalRun('GEO-9801');
  setState(ctx.db, 'GEO-9801', 'dropped', { note: 'kettle recalled' }, 'z-delivery');

  const plan = readSlotPlan(ctx.db, ctx.sample);

  expect([plan?.plan?.picks.map((pick) => pick.issue), plan?.eligible]).toStrictEqual([['GEO-9805', 'GEO-9804', 'GEO-9802'], 4]);
});

test('a skip set after the Ready read leaves its issue out of the picks at the next look', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  writeLaneSkip(ctx.db, { issue: 'GEO-9801', until: 'GEO-9899', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });

  const plan = readSlotPlan(ctx.db, ctx.sample);

  expect([plan?.plan?.picks.map((pick) => pick.issue), plan?.eligible]).toStrictEqual([['GEO-9805', 'GEO-9804', 'GEO-9802'], 4]);
});

test('the plan lists the active skips of eligible Ready issues, leaving out those with a run or not in Ready', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  const skip = (issue: string): void => {
    writeLaneSkip(ctx.db, { issue, until: 'pr:impz#654', reason: 'waits on the descaler PR', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });
  };
  skip('GEO-9801');
  skip('GEO-9805');
  skip('GEO-9890');
  ctx.addLocalRun('GEO-9805');

  const plan = readSlotPlan(ctx.db, ctx.sample);

  expect(plan?.skipped).toStrictEqual([{ issue: 'GEO-9801', until: 'pr:impz#654', reason: 'waits on the descaler PR', by: 'z-delivery', at: '2026-10-15T20:00:00Z' }]);
});

test('a skip whose time has passed stops leaving its issue out, with no fresh Ready read', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  writeLaneSkip(ctx.db, { issue: 'GEO-9801', until: '2026-10-15T20:10:00Z', reason: 'held for ten minutes', actor: 'z-delivery', at: new Date('2026-10-15T20:00:00Z') });

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:15:00Z'));

  expect(plan?.plan?.picks.map((pick) => pick.issue)).toStrictEqual(['GEO-9801', 'GEO-9805', 'GEO-9804']);
});

test('local slots free none, and say why, when the localFallback is used up', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  ctx.addLocalRun('GEO-9804');
  ctx.addLocalRun('GEO-9805');

  const plan = readSlotPlan(ctx.db, { ...ctx.sample, localRoom: 2 });
  if (plan === null) {
    throw new Error('no slot plan');
  }

  expect(plan.pool).toStrictEqual({ impSize: 0, localSize: 3, impRunning: 0, localRunning: 2, impFree: 0, localFree: 0, free: 0, capHeld: false, held: null, localHeld: 'no unattended provider can start local work: localFallback 2 in use', localSource: null });
  expect(plan.plan?.picks).toStrictEqual([]);
  expect(formatSlotPlan(plan)[0]).toBe('slots (running/size, free now): imp 0/0, 0 free; local 2/3, 0 free (no unattended provider can start local work: localFallback 2 in use)');
});

test('the tick nudges for no local slot when the localFallback is used up', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  ctx.addLocalRun('GEO-9804');
  ctx.addLocalRun('GEO-9805');

  const result = tick(ctx.db, { ...ctx.sample, localRoom: 2 }, 'hq-lanes');

  expect([result.slots, result.nudged, result.why]).toStrictEqual([0, false, 'lanes full']);
});

test('local slots stay free by count when an unattended provider targets local', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  ctx.addLocalRun('GEO-9804');
  ctx.addLocalRun('GEO-9805');
  const localRoom = parseLocalRoom({ providers: { teapot: { unattended: true, target: 'local' }, kettle: { unattended: true, target: 'imp', localFallback: 2 } } });

  const plan = readSlotPlan(ctx.db, { ...ctx.sample, localRoom });

  expect([plan?.pool.localFree, plan?.pool.localHeld, plan?.plan?.picks.map((pick) => pick.issue)]).toStrictEqual([1, null, ['GEO-9801']]);
});

test('a cap below the pool free slots takes the difference off the free slots and the picks', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  ctx.addLocalRun('GEO-9805');
  setMeta(ctx.db, 'lanes_cap', JSON.stringify({ cap: 2, until: null, reason: 'quota', by: 'z-stu', at: '2026-10-15T19:00:00Z' }));

  const plan = readSlotPlan(ctx.db, ctx.sample);

  expect(plan?.pool.free).toBe(1);
  expect(plan?.plan?.picks.map((pick) => pick.issue)).toStrictEqual(['GEO-9801']);
  expect(plan?.cap).toStrictEqual({ cap: 2, until: null, reason: 'quota', by: 'z-stu', working: 1, limitedBy: 'cap', workingFrom: 'runs' });
});

test('a cap above the pool free slots leaves the pool in charge', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  ctx.addLocalRun('GEO-9805');
  setMeta(ctx.db, 'lanes_cap', JSON.stringify({ cap: 9, until: null, reason: null, by: 'z-stu', at: '2026-10-15T19:00:00Z' }));

  const plan = readSlotPlan(ctx.db, ctx.sample);

  expect(plan?.pool.free).toBe(2);
  expect(plan?.cap.limitedBy).toBe('pool');
});

test('a cap of zero frees no slot and picks nothing', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  setMeta(ctx.db, 'lanes_cap', JSON.stringify({ cap: 0, until: null, reason: 'freeze', by: 'z-stu', at: '2026-10-15T19:00:00Z' }));

  const plan = readSlotPlan(ctx.db, ctx.sample);

  expect(plan?.pool.free).toBe(0);
  expect(plan?.plan?.picks).toStrictEqual([]);
});

test('a cap whose time has passed no longer limits the slots', async () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  await ctx.seedReady(ctx.readySeeds);
  setMeta(ctx.db, 'lanes_cap', JSON.stringify({ cap: 0, until: '2026-10-15T19:30:00Z', reason: 'freeze', by: 'z-stu', at: '2026-10-15T19:00:00Z' }));

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.pool.free).toBe(3);
  expect(plan?.cap.limitedBy).toBeNull();
});

test('a malformed stored cap limits nothing', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  setMeta(ctx.db, 'lanes_cap', '{"cap":-3}');

  const plan = readSlotPlan(ctx.db, ctx.sample);

  expect(plan?.pool.free).toBe(3);
});
