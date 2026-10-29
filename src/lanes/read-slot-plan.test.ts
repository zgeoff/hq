import { expect, onTestFinished, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import type { ReadyNodeSeed } from '../../test/build-ready-page.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { makeStateCall } from '../../test/make-state-call.ts';
import { runFocusCommand } from '../focus/run-focus-command.ts';
import { addRun } from '../runs/add-run.ts';
import type { AddRunInput } from '../runs/types.ts';
import { setMeta } from '../db/set-meta.ts';
import { writeIssues } from '../linear/write-issues.ts';
import { setState } from '../runs/set-state.ts';
import { formatSlotNudge } from './format-slot-nudge.ts';
import { formatSlotPlan } from './format-slot-plan.ts';
import { parseLocalRoom } from './parse-local-room.ts';
import { readLinearReady } from './read-linear-ready.ts';
import { readSlotPlan } from './read-slot-plan.ts';
import { tick } from './tick.ts';
import type { ReadyIssue } from './types.ts';
import { validateLaneRules } from './validate-lane-rules.ts';
import { writeDesignBacklog } from './write-design-backlog.ts';
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

  // A design ticket as a Ready or Backlog read holds it, with the 2 agent and 1 with-geoff design pass pacing.json gives by default.
  const createdAt = '2026-10-01T00:00:00Z';
  const buildTicket = (identifier: string, priority: number, type: ReadyIssue['type'] = 'Design'): ReadyIssue => ({ identifier, project: 'kettle roadmap', projectLabels: [], labels: ['atc'], type, priority, createdAt, parent: null });
  const seedSnapshot = (eligible: ReadyIssue[], design: ReadyIssue[] = []): void => {
    setMeta(fresh.db, 'lanes_ready_issues', JSON.stringify({ at: '2026-10-15T20:00:00Z', eligible, design }));
  };
  const addAnyRun = (issue: string, extra: Partial<AddRunInput> = {}) => addRun(fresh.db, { issue, title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery', ...extra });
  const plan = () => {
    const slotPlan = readSlotPlan(fresh.db, sample, new Date('2026-10-15T20:00:00Z'));
    if (slotPlan === null) {
      throw new Error('no slot plan');
    }
    return slotPlan;
  };
  return { db: fresh.db, readySeeds, sample, seedReady, addLocalRun, buildTicket, seedSnapshot, addAnyRun, plan };
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

test('it gives the time the Ready read its picks come from was stored', async () => {
  const ctx = setupTest();
  at('2026-10-15T20:03:00Z');
  await ctx.seedReady([{ identifier: 'GEO-9821', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 2 }]);

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:10:00Z'));

  expect(plan?.readyReadAt).toBe('2026-10-15T20:03:00Z');
});

test('it gives no Ready read time with no Ready read', () => {
  const ctx = setupTest();
  at('2026-10-15T20:10:00Z');

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:10:00Z'));

  expect(plan?.readyReadAt).toBeNull();
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
  expect(formatSlotPlan(plan, new Date('2026-10-15T20:00:00Z'))[0]).toBe('slots (running/size, free now): imp 0/0, 0 free; local 2/3, 0 free (no unattended provider can start local work: localFallback 2 in use)');
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

test('a design pass fills a design lane and changes no delivery number, and hq lanes lists the 3 lanes', () => {
  const ctx = setupTest();
  ctx.addAnyRun('GEO-9801', { title: 'Descale the kettle' });
  const before = ctx.plan();

  ctx.addAnyRun('GEO-9802', { design: 'agent', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  const after = ctx.plan();

  expect(before.design).toStrictEqual({ agent: { open: 0, slots: 2, next: [] }, withGeoff: { open: 0, slots: 1, next: [], asked: [] } });
  expect(after.design.agent.open).toBe(1);
  expect([after.pool, after.cap.working]).toStrictEqual([before.pool, before.cap.working]);
  expect(after.pool.localRunning).toBe(1);
  expect(formatSlotPlan(after, new Date('2026-10-15T20:00:00Z')).at(-1)).toBe('design: agent 1/2, with-geoff 0/1');
});

test('a Design-type issue run with no --design flag fills the with-geoff lane and no delivery slot', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9803', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);

  ctx.addAnyRun('GEO-9803', { geoffChat: true });

  expect([ctx.plan().design.withGeoff.open, ctx.plan().pool.localRunning]).toStrictEqual([1, 0]);
});

test('a with-geoff pass started with --asked shows above the lane count in the lanes line', () => {
  const ctx = setupTest();
  ctx.addAnyRun('GEO-9804', { design: 'with-geoff' });
  ctx.addAnyRun('GEO-9805', { design: 'with-geoff', asked: 'chat 29 Oct' });

  expect(formatSlotPlan(ctx.plan(), new Date('2026-10-15T20:00:00Z')).at(-1)).toBe('design: agent 0/2, with-geoff 2/1 (asked: chat 29 Oct)');
});

test('a closed design run does not stop its issue being picked once Ready, and an open one does', () => {
  const ctx = setupTest();
  ctx.addAnyRun('GEO-9814', { design: 'agent' });
  ctx.addAnyRun('GEO-9815', { design: 'agent' });
  setState(ctx.db, 'GEO-9814', 'done', { note: 'design settled' }, 'z-delivery');
  ctx.seedSnapshot([ctx.buildTicket('GEO-9814', 2, 'Feature'), ctx.buildTicket('GEO-9815', 2, 'Feature')]);

  expect(ctx.plan().plan?.picks.map((pick) => pick.issue)).toStrictEqual(['GEO-9814']);
});

test('a built issue that is Design type still counts as a delivery run', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9812', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);
  ctx.addAnyRun('GEO-9812');
  setState(ctx.db, 'GEO-9812', 'done', { note: 'design settled' }, 'z-delivery');

  ctx.addAnyRun('GEO-9812', { title: 'Build the whistle' });

  expect([ctx.plan().pool.localRunning, ctx.plan().design.withGeoff.open]).toStrictEqual([1, 0]);
});

test('the needs-design queues name an issue per free lane in focus order, leave out an issue with an open run, and print in the lanes line and the nudge', () => {
  const ctx = setupTest();
  ctx.seedSnapshot([], [ctx.buildTicket('GEO-9824', 3)]);
  writeDesignBacklog(ctx.db, {
    at: new Date('2026-10-15T20:00:00Z'),
    agent: [ctx.buildTicket('GEO-9821', 3), ctx.buildTicket('GEO-9822', 1), ctx.buildTicket('GEO-9823', 2)],
    withGeoff: [ctx.buildTicket('GEO-9825', 1)],
  });
  ctx.addAnyRun('GEO-9823', { design: 'agent' });

  const plan = ctx.plan();

  expect(plan.design).toStrictEqual({ agent: { open: 1, slots: 2, next: ['GEO-9822'] }, withGeoff: { open: 0, slots: 1, next: ['GEO-9825'], asked: [] } });
  expect(formatSlotPlan(plan, new Date('2026-10-15T20:00:00Z')).at(-1)).toBe('design: agent 1/2 (next GEO-9822), with-geoff 0/1 (next GEO-9825)');
  expect(formatSlotNudge(plan, 12)).toInclude('design: agent 1/2 (next GEO-9822), with-geoff 0/1 (next GEO-9825).');
});

test('a full with-geoff lane still names the next issue, as waiting, from the Ready Design issues', () => {
  const ctx = setupTest();
  ctx.seedSnapshot([], [ctx.buildTicket('GEO-9831', 2)]);
  ctx.addAnyRun('GEO-9832', { design: 'with-geoff' });

  expect(formatSlotPlan(ctx.plan(), new Date('2026-10-15T20:00:00Z')).at(-1)).toBe('design: agent 0/2, with-geoff 1/1 (next GEO-9831, waiting)');
});

test('a stale Backlog read names no needs-design issue', () => {
  const ctx = setupTest();
  writeDesignBacklog(ctx.db, { at: new Date('2026-10-15T19:00:00Z'), agent: [ctx.buildTicket('GEO-9841', 2)], withGeoff: [ctx.buildTicket('GEO-9842', 2)] });

  expect(ctx.plan().design).toStrictEqual({ agent: { open: 0, slots: 2, next: [] }, withGeoff: { open: 0, slots: 1, next: [], asked: [] } });
});
