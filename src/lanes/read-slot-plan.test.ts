import { expect, onTestFinished, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import type { ReadyNodeSeed } from '../../test/build-ready-page.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { buildReadyIssue } from '../../test/build-ready-issue.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { makeStateCall } from '../../test/make-state-call.ts';
import { runFocusCommand } from '../focus/run-focus-command.ts';
import { addRun } from '../runs/add-run.ts';
import { reopenRun } from '../runs/reopen-run.ts';
import { setMeta } from '../db/set-meta.ts';
import { writeIssues } from '../linear/write-issues.ts';
import { setState } from '../runs/set-state.ts';
import { formatSlotNudge } from './format-slot-nudge.ts';
import { formatSlotPlan } from './format-slot-plan.ts';
import { parseLocalRoom } from './parse-local-room.ts';
import { readLinearReady } from './read-linear-ready.ts';
import { readSlotMinutes } from './read-slot-minutes.ts';
import { readSlotPlan } from './read-slot-plan.ts';
import { tick } from './tick.ts';
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
  const addImpRun = (issue: string): void => {
    addRun(fresh.db, { issue, title: 'Polish the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });
  };
  return { db: fresh.db, readySeeds, sample, seedReady, addLocalRun, addImpRun };
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

test('it counts an agent design pass in the agent design lane', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9802', title: 'Design the kettle spout', place: 'local', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.design).toStrictEqual({ countsError: null, agent: { open: 1, slots: 2, next: [] }, withGeoff: { open: 0, slots: 1, next: [], asked: [] } });
});

test('it holds no delivery slot and no cap count for an agent design pass', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9801', title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9802', title: 'Design the kettle spout', place: 'local', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.pool).toMatchObject({ localRunning: 1, localFree: 2, free: 2 });
  expect(plan?.cap.working).toBe(1);
});

test('it prints the design lanes as the last line of the lanes plan', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9802', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));
  if (plan === null) {
    throw new Error('no slot plan');
  }

  const lines = formatSlotPlan(plan, new Date('2026-10-15T20:00:00Z'));

  expect(lines.at(-1)).toBe('design: agent 1/2, with-geoff 0/1');
});

test('it counts a Design-type issue run added with no --design flag in the with-geoff lane', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9803', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9803', title: 'Design: a quieter kettle whistle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, actor: 'z-delivery' });

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.design.withGeoff.open).toBe(1);
  expect(plan?.pool.localRunning).toBe(0);
});

test('it prints where the owner asked for a with-geoff pass above the lane count', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9804', title: 'Design the kettle spout', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9805', title: 'Design the kettle lid', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', asked: 'chat 29 Oct', actor: 'z-delivery' });
  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));
  if (plan === null) {
    throw new Error('no slot plan');
  }

  const lines = formatSlotPlan(plan, new Date('2026-10-15T20:00:00Z'));

  expect(lines.at(-1)).toBe('design: agent 0/2, with-geoff 2/1 (asked: chat 29 Oct)');
});

test('it picks the Ready issue of a closed design pass and leaves out one whose pass is open', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9814', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9815', title: 'Design the kettle lid', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9814', 'done', { note: 'design settled' }, 'z-delivery');
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: '2026-10-15T20:00:00Z', eligible: [buildReadyIssue('GEO-9814', { project: 'kettle roadmap', type: 'Feature', priority: 2 }), buildReadyIssue('GEO-9815', { project: 'kettle roadmap', type: 'Feature', priority: 2 })], design: [] }));

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.plan?.picks.map((pick) => pick.issue)).toStrictEqual(['GEO-9814']);
});

test('it leaves out of the picks a Ready issue whose closed run from before v46 was its Design-type pass', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9816', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9816', title: 'Design: a quieter kettle whistle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, actor: 'z-delivery' });
  ctx.db.query('UPDATE runs SET design_lane = NULL WHERE issue = ?').run('GEO-9816');
  setState(ctx.db, 'GEO-9816', 'done', { note: 'design settled' }, 'z-delivery');
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: '2026-10-15T20:00:00Z', eligible: [buildReadyIssue('GEO-9816', { project: 'kettle roadmap', type: 'Feature', priority: 2 })], design: [] }));

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.plan?.picks).toStrictEqual([]);
});

test('it counts the build run of a Design-type issue as a delivery run', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9812', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9812', title: 'Design: a quieter kettle whistle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9812', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9812', title: 'Build the whistle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.pool.localRunning).toBe(1);
  expect(plan?.design.withGeoff.open).toBe(0);
});

test('it names a needs-design issue per free design lane in focus order, leaving out an issue with an open run', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: '2026-10-15T20:00:00Z', eligible: [], design: [buildReadyIssue('GEO-9824', { project: 'kettle roadmap', type: 'Design', priority: 3 })] }));
  writeDesignBacklog(ctx.db, {
    at: new Date('2026-10-15T20:00:00Z'),
    agent: [buildReadyIssue('GEO-9821', { project: 'kettle roadmap', type: 'Design', priority: 3 }), buildReadyIssue('GEO-9822', { project: 'kettle roadmap', type: 'Design', priority: 1 }), buildReadyIssue('GEO-9823', { project: 'kettle roadmap', type: 'Design', priority: 2 })],
    withGeoff: [buildReadyIssue('GEO-9825', { project: 'kettle roadmap', type: 'Design', priority: 1 })],
  });
  addRun(ctx.db, { issue: 'GEO-9823', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.design).toStrictEqual({ countsError: null, agent: { open: 1, slots: 2, next: ['GEO-9822'] }, withGeoff: { open: 0, slots: 1, next: ['GEO-9825'], asked: [] } });
});

test('it leaves out of the design queues an issue whose design pass is closed', () => {
  const ctx = setupTest();
  writeDesignBacklog(ctx.db, { at: new Date('2026-10-15T20:00:00Z'), agent: [buildReadyIssue('GEO-9826', { project: 'kettle roadmap', type: 'Design', priority: 2 })], withGeoff: [buildReadyIssue('GEO-9827', { project: 'kettle roadmap', type: 'Design', priority: 2 })] });
  addRun(ctx.db, { issue: 'GEO-9826', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9827', title: 'Design the kettle lid', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9826', 'done', { note: 'design settled' }, 'z-delivery');
  setState(ctx.db, 'GEO-9827', 'dropped', { note: 'design parked' }, 'z-delivery');

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.design).toStrictEqual({ countsError: null, agent: { open: 0, slots: 2, next: [] }, withGeoff: { open: 0, slots: 1, next: [], asked: [] } });
});

test('it names the design lanes and their next issues in the lanes nudge', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: '2026-10-15T20:00:00Z', eligible: [], design: [] }));
  writeDesignBacklog(ctx.db, { at: new Date('2026-10-15T20:00:00Z'), agent: [buildReadyIssue('GEO-9822', { project: 'kettle roadmap', type: 'Design', priority: 1 })], withGeoff: [buildReadyIssue('GEO-9825', { project: 'kettle roadmap', type: 'Design', priority: 1 })] });
  addRun(ctx.db, { issue: 'GEO-9823', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));
  if (plan === null) {
    throw new Error('no slot plan');
  }

  const nudge = formatSlotNudge(plan, 12);

  expect(nudge).toInclude('design: agent 1/2 (next GEO-9822), with-geoff 0/1 (next GEO-9825).');
});

test('it names the next issue for a full with-geoff lane, as waiting, from the Ready Design issues', () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'lanes_ready_issues', JSON.stringify({ at: '2026-10-15T20:00:00Z', eligible: [], design: [buildReadyIssue('GEO-9831', { project: 'kettle roadmap', type: 'Design', priority: 2 })] }));
  addRun(ctx.db, { issue: 'GEO-9832', title: 'Design the kettle spout', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', actor: 'z-delivery' });
  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));
  if (plan === null) {
    throw new Error('no slot plan');
  }

  const lines = formatSlotPlan(plan, new Date('2026-10-15T20:00:00Z'));

  expect(lines.at(-1)).toBe('design: agent 0/2, with-geoff 1/1 (next GEO-9831, waiting)');
});

test('it names no needs-design issue from a stale Backlog read', () => {
  const ctx = setupTest();
  writeDesignBacklog(ctx.db, { at: new Date('2026-10-15T19:00:00Z'), agent: [buildReadyIssue('GEO-9841', { project: 'kettle roadmap', type: 'Design', priority: 2 })], withGeoff: [buildReadyIssue('GEO-9842', { project: 'kettle roadmap', type: 'Design', priority: 2 })] });

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.design).toStrictEqual({ countsError: null, agent: { open: 0, slots: 2, next: [] }, withGeoff: { open: 0, slots: 1, next: [], asked: [] } });
});

test('it names no needs-design issue while the design counts in pacing.json are unreadable', () => {
  const ctx = setupTest();
  writeDesignBacklog(ctx.db, { at: new Date('2026-10-15T20:00:00Z'), agent: [buildReadyIssue('GEO-9843', { project: 'kettle roadmap', type: 'Design', priority: 2 })], withGeoff: [buildReadyIssue('GEO-9844', { project: 'kettle roadmap', type: 'Design', priority: 2 })] });

  const plan = readSlotPlan(ctx.db, { ...ctx.sample, design: { agent: 2, withGeoff: 1 }, designError: 'pacing.json: agentDesignSlots is wrong' }, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.design).toStrictEqual({ countsError: 'pacing.json: agentDesignSlots is wrong', agent: { open: 0, slots: 2, next: [] }, withGeoff: { open: 0, slots: 1, next: [], asked: [] } });
});

test('it gives a free agent design lane the needs-design issue that matches the focus before a higher-priority one', async () => {
  const ctx = setupTest();
  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-15T20:00:00Z'), verb: 'set', rest: ['maintenance'], reserves: [] });
  writeDesignBacklog(ctx.db, {
    at: new Date('2026-10-15T20:00:00Z'),
    agent: [buildReadyIssue('GEO-9851', { project: 'kettle roadmap', type: 'Design', priority: 1 }), buildReadyIssue('GEO-9852', { project: 'kettle maintenance', projectLabels: ['maintenance'], type: 'Design', priority: 4 })],
    withGeoff: [],
  });
  addRun(ctx.db, { issue: 'GEO-9853', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.design.agent.next).toStrictEqual(['GEO-9852']);
});

test('it lists where the owner asked for a with-geoff pass reopened above the lane count', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9874', title: 'Design the whistle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9874', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9875', title: 'Design the handle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', actor: 'z-delivery' });
  reopenRun(ctx.db, { issue: 'GEO-9874', next: 'Reopened: the owner chats.', design: { error: null, asked: 'chat 30 Oct' }, actor: 'z-delivery' });

  const plan = readSlotPlan(ctx.db, ctx.sample, new Date('2026-10-15T20:00:00Z'));

  expect(plan?.design.withGeoff).toStrictEqual({ open: 2, slots: 1, next: [], asked: ['chat 30 Oct'] });
});

test('it plans, prints and ticks the same with placeTypes null as with no placeTypes key', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);
  ctx.addLocalRun('GEO-9805');

  const withoutKey = readSlotPlan(ctx.db, ctx.sample);
  const withNull = readSlotPlan(ctx.db, { ...ctx.sample, placeTypes: null });
  if (withoutKey === null || withNull === null) {
    throw new Error('no slot plan');
  }

  expect(withNull).toStrictEqual(withoutKey);
  expect(formatSlotPlan(withNull, new Date('2026-10-15T20:00:00Z'))).toStrictEqual([
    'slots (running/size, free now): imp 0/0, 0 free; local 1/3, 2 free',
    'local: 1 of 3 delivery sessions on this host',
    'focus: none (all eligible work by priority)',
    'next: GEO-9801, GEO-9804 (4 eligible; Ready read just now)',
    'design: agent 0/2, with-geoff 0/1',
  ]);
});

test('it passes over a Bug for the free local slot and picks the next issue whose Type local takes', async () => {
  const ctx = setupTest();
  await ctx.seedReady([
    { identifier: 'GEO-9821', project: 'kettle roadmap', type: 'Bug', labels: ['atc'], priority: 1 },
    { identifier: 'GEO-9822', project: 'kettle roadmap', type: 'Investigation', labels: ['atc'], priority: 2 },
    { identifier: 'GEO-9823', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 },
  ]);
  ctx.addImpRun('GEO-9823');

  const plan = readSlotPlan(ctx.db, { ...ctx.sample, slots: { imp: 1, local: 1 }, placeTypes: { local: ['Design', 'Refactor', 'Investigation'] } });

  expect([plan?.pool.impFree, plan?.pool.localFree, plan?.plan?.picks]).toStrictEqual([0, 1, [{ issue: 'GEO-9822', term: null, reserve: null, place: 'local' }]]);
});

test('it picks no issue when only Bugs are eligible and only a local slot is free, and says so in one line', async () => {
  const ctx = setupTest();
  await ctx.seedReady([
    { identifier: 'GEO-9831', project: 'kettle roadmap', type: 'Bug', labels: ['atc'], priority: 1 },
    { identifier: 'GEO-9832', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 },
  ]);
  ctx.addImpRun('GEO-9832');

  const plan = readSlotPlan(ctx.db, { ...ctx.sample, slots: { imp: 1, local: 1 }, placeTypes: { local: ['Design', 'Refactor', 'Investigation'] } });
  if (plan === null) {
    throw new Error('no slot plan');
  }

  expect(plan.plan).toStrictEqual({ picks: [], lent: [], unfit: { slots: 1, places: [{ place: 'local', types: ['Design', 'Refactor', 'Investigation'] }] } });
  expect(formatSlotPlan(plan, new Date('2026-10-15T20:00:00Z')).slice(3, 5)).toStrictEqual(['next: nothing (1 eligible; Ready read just now)', '  no fit: 1 free slot(s) fit no eligible issue (local takes Design, Refactor, Investigation)']);
});

test('it counts a free slot no eligible issue may fill as supply minutes, not empty delivery minutes or idle slot-minutes', async () => {
  const ctx = setupTest();
  await ctx.seedReady([
    { identifier: 'GEO-9841', project: 'kettle roadmap', type: 'Bug', labels: ['atc'], priority: 1 },
    { identifier: 'GEO-9842', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 },
  ]);
  ctx.addImpRun('GEO-9842');
  const sample = { ...ctx.sample, slots: { imp: 1, local: 1 }, placeTypes: { local: ['Design', 'Refactor', 'Investigation'] } };
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-15T20:10:00Z');

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect([result.slots, result.slotCause.cause, result.slotCause.slots]).toStrictEqual([0, 'supply', 1]);
  expect(ctx.db.query('SELECT slots FROM lanes_samples ORDER BY seq').all()).toStrictEqual([{ slots: 0 }, { slots: 0 }]);
  expect(readSlotMinutes(ctx.db, '2026-10-16')).toStrictEqual({ delivery: 0, triage: 0, supply: 10, design: 0 });
});
