import { expect, onTestFinished, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import type { ReadyNodeSeed } from '../../test/build-ready-page.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { makeStateCall } from '../../test/make-state-call.ts';
import { runFocusCommand } from '../focus/run-focus-command.ts';
import { addRun } from '../runs/add-run.ts';
import { readLinearReady } from './read-linear-ready.ts';
import { readSlotPlan } from './read-slot-plan.ts';
import { validateLaneRules } from './validate-lane-rules.ts';

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
    await readLinearReady(fresh.db, call, 'hq-lanes', rules);
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

  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', verb: 'set', rest: ['bug,maintenance'], reserves: ['nixie=1'] });
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

  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', verb: 'set', rest: ['maintenance'], reserves: ['nixie=1'] });

  expect(readSlotPlan(ctx.db, ctx.sample)?.plan?.picks.map((pick) => pick.issue)).toStrictEqual(['GEO-9802', 'GEO-9803']);
});

test('a reserved slot with nothing eligible in its area is lent to the focus work', async () => {
  const ctx = setupTest();
  await ctx.seedReady(ctx.readySeeds);

  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', verb: 'set', rest: ['bug'], reserves: ['imp=2'] });

  expect(readSlotPlan(ctx.db, ctx.sample)?.plan).toStrictEqual({
    picks: [
      { issue: 'GEO-9802', term: 0, reserve: null },
      { issue: 'GEO-9801', term: null, reserve: null },
      { issue: 'GEO-9805', term: null, reserve: null },
    ],
    lent: [{ area: 'imp', slots: 2 }],
  });
});
