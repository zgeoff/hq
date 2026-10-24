import { expect, onTestFinished, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import type { ReadyNodeSeed } from '../../test/build-ready-page.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { makeStateCall } from '../../test/make-state-call.ts';
import { runFocusCommand } from '../focus/run-focus-command.ts';
import { readLinearReady } from './read-linear-ready.ts';
import { readSlotMinutes } from './read-slot-minutes.ts';
import { tick } from './tick.ts';
import { validateLaneRules } from './validate-lane-rules.ts';
import { writePromotableFocus } from './write-promotable-focus.ts';

// The ISO times are 12:00 Sydney on 14 Oct 2026 and the minutes after it. Each test's sample has three
// local slots and no imp ones, so the pool holds three free slots while no run is open.
function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const rules = validateLaneRules(rulesTable, null);
  const seedReady = async (seeds: ReadyNodeSeed[]): Promise<void> => {
    await readLinearReady(fresh.db, { call: makePagedCall(buildReadyPage(seeds, null)), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
  };
  const queued = () => fresh.db.query("SELECT target, text FROM outbox WHERE text LIKE 'Lanes: % slot-minutes empty today%' ORDER BY id").all();
  return { db: fresh.db, seedReady, queued };
}

test('it tags no cause and counts no minutes while Ready work has waited 10 minutes or less', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:04:00Z');

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect(result.slotCause).toStrictEqual({ cause: null, slots: 3, since: '2026-10-14T01:00:00Z', readyAgeMinutes: 4, reason: null, waitingMinutes: 4 });
  expect(readSlotMinutes(ctx.db, '2026-10-14')).toStrictEqual({ delivery: 0, triage: 0, supply: 0 });
});

test('it tags delivery once Ready work has waited more than 10 minutes, and counts free slots times the minutes since the last look', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:05:00Z');
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:11:00Z');

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect(result.slotCause).toStrictEqual({ cause: 'delivery', slots: 3, since: '2026-10-14T01:11:00Z', readyAgeMinutes: 11, reason: null, waitingMinutes: null });
  expect(readSlotMinutes(ctx.db, '2026-10-14')).toStrictEqual({ delivery: 18, triage: 0, supply: 0 });
});

test('it counts at most 30 minutes for a gap between looks', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:11:00Z');
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:51:00Z');
  await ctx.seedReady([{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);

  tick(ctx.db, sample, 'hq-lanes');

  expect(readSlotMinutes(ctx.db, '2026-10-14').delivery).toBe(33 + 90);
});

test('it restarts the grace time when no free slot meets Ready work for a look', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:08:00Z');
  tick(ctx.db, { ...sample, slots: { imp: 0, local: 0 } }, 'hq-lanes');
  at('2026-10-14T01:12:00Z');

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect(result.slotCause.cause).toBeNull();
  expect(result.slotCause.waitingMinutes).toBe(0);
});

test('it keeps the grace time running through a look whose capacity read failed', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:05:00Z');
  tick(ctx.db, { ...sample, cap: null, error: 'capacity.sh timed out' }, 'hq-lanes');
  at('2026-10-14T01:12:00Z');

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect(result.slotCause).toStrictEqual({ cause: 'delivery', slots: 3, since: '2026-10-14T01:12:00Z', readyAgeMinutes: 12, reason: null, waitingMinutes: null });
  expect(readSlotMinutes(ctx.db, '2026-10-14').delivery).toBe(21);
});

test('it tags triage when no Ready work waits and Backlog work asks for promotion', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 2, focus: '[]', at: new Date('2026-10-14T01:00:00Z') });
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:05:00Z');

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect(result.slotCause).toStrictEqual({ cause: 'triage', slots: 3, since: '2026-10-14T01:00:00Z', readyAgeMinutes: 5, reason: null, waitingMinutes: null });
  expect(readSlotMinutes(ctx.db, '2026-10-14')).toStrictEqual({ delivery: 0, triage: 15, supply: 0 });
});

test('it tags supply when no Ready work waits and no Backlog issue matches the focus', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 0, focus: '[]', at: new Date('2026-10-14T01:00:00Z') });
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:05:00Z');

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect(result.slotCause.cause).toBe('supply');
  expect(readSlotMinutes(ctx.db, '2026-10-14')).toStrictEqual({ delivery: 0, triage: 0, supply: 15 });
});

test('it tags unknown and counts nothing when the Backlog count is unknown', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: null, focus: '[]', at: new Date('2026-10-14T01:00:00Z') });
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:05:00Z');

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect(result.slotCause.cause).toBe('unknown');
  expect(result.slotCause.reason).toBe('backlog_unknown');
  expect(result.slotCause.readyAgeMinutes).toBe(5);
  expect(readSlotMinutes(ctx.db, '2026-10-14')).toStrictEqual({ delivery: 0, triage: 0, supply: 0 });
});

test('it tags unknown and counts nothing when the focus has changed since the Backlog count', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 2, focus: '[]', at: new Date('2026-10-14T01:00:00Z') });
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:05:00Z');
  await runFocusCommand({ db: ctx.db, call: makeStateCall([], []), actor: 'kettle-owner', at: new Date('2026-10-14T01:04:00Z'), verb: 'set', rest: ['bug'], reserves: [] });

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect(result.slotCause).toStrictEqual({ cause: 'unknown', slots: 3, since: '2026-10-14T01:05:00Z', readyAgeMinutes: 5, reason: 'backlog_focus_changed', waitingMinutes: null });
  expect(readSlotMinutes(ctx.db, '2026-10-14')).toStrictEqual({ delivery: 0, triage: 0, supply: 0 });
});

test('it tags unknown with the age of the Ready data and counts nothing when the Ready read is stale', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:42:00Z');

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect(result.slotCause).toStrictEqual({ cause: 'unknown', slots: 3, since: '2026-10-14T01:42:00Z', readyAgeMinutes: 42, reason: 'ready_stale', waitingMinutes: null });
  expect(readSlotMinutes(ctx.db, '2026-10-14')).toStrictEqual({ delivery: 0, triage: 0, supply: 0 });
});

test('it tags no cause when no slot is free', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:20:00Z');

  const result = tick(ctx.db, { ...sample, slots: { imp: 0, local: 0 } }, 'hq-lanes');

  expect(result.slotCause).toStrictEqual({ cause: null, slots: 0, since: null, readyAgeMinutes: 20, reason: null, waitingMinutes: null });
  expect(readSlotMinutes(ctx.db, '2026-10-14').delivery).toBe(0);
});

test('it tells the delivery session once a day when delivery reaches 60 slot-minutes', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  await ctx.seedReady([{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:11:00Z');
  tick(ctx.db, sample, 'hq-lanes');
  const before = ctx.queued();
  at('2026-10-14T01:22:00Z');
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T01:28:00Z');

  tick(ctx.db, sample, 'hq-lanes');

  expect(before).toStrictEqual([]);
  expect(ctx.queued()).toStrictEqual([
    { target: 'z-delivery', text: 'Lanes: 66 slot-minutes empty today with Ready work waiting (delivery). Free slots: 3.' },
  ]);
});

test('it tells the triage session at any hour when triage reaches 60 slot-minutes', async () => {
  const ctx = setupTest();
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  at('2026-10-14T17:00:00Z');
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 1, focus: '[]', at: new Date('2026-10-14T17:00:00Z') });
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T17:30:00Z');

  tick(ctx.db, sample, 'hq-lanes');

  expect(ctx.queued()).toStrictEqual([{ target: 'z-triage', text: 'Lanes: 90 slot-minutes empty today with no Ready work and Backlog issues waiting to be promoted (triage). Free slots: 3.' }]);
});

test('it tells the triage and delivery sessions during quiet hours while the supply alert waits', async () => {
  const ctx = setupTest();
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  at('2026-10-14T17:00:00Z');
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 0, focus: '[]', at: new Date('2026-10-14T17:00:00Z') });
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T17:30:00Z');
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T18:00:00Z');
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 2, focus: '[]', at: new Date('2026-10-14T18:00:00Z') });
  tick(ctx.db, sample, 'hq-lanes');
  await ctx.seedReady([{ identifier: 'GEO-9801', project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }]);
  at('2026-10-14T18:01:00Z');
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T18:12:00Z');
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T18:23:00Z');

  tick(ctx.db, sample, 'hq-lanes');

  expect(ctx.queued()).toStrictEqual([
    { target: 'z-triage', text: 'Lanes: 90 slot-minutes empty today with no Ready work and Backlog issues waiting to be promoted (triage). Free slots: 3.' },
    { target: 'z-delivery', text: 'Lanes: 66 slot-minutes empty today with Ready work waiting (delivery). Free slots: 3.' },
  ]);
});

test('it holds the supply alert for the owner through quiet hours and sends it at the first look after them', async () => {
  const ctx = setupTest();
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  at('2026-10-14T17:00:00Z');
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 0, focus: '[]', at: new Date('2026-10-14T17:00:00Z') });
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T17:30:00Z');
  tick(ctx.db, sample, 'hq-lanes');
  const quiet = ctx.queued();
  at('2026-10-14T20:00:00Z');
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 0, focus: '[]', at: new Date('2026-10-14T20:00:00Z') });

  tick(ctx.db, sample, 'hq-lanes');

  expect(quiet).toStrictEqual([]);
  expect(ctx.queued()).toStrictEqual([{ target: 'z-stu', text: 'Lanes: 180 slot-minutes empty today with no Ready work and no Backlog issue to promote (supply). Free slots: 3.' }]);
});

test('it sends the owner the held supply alert at the first look after quiet hours even when the cause has become triage', async () => {
  const ctx = setupTest();
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  at('2026-10-14T17:00:00Z');
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 0, focus: '[]', at: new Date('2026-10-14T17:00:00Z') });
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T17:30:00Z');
  tick(ctx.db, sample, 'hq-lanes');
  const quiet = ctx.queued();
  at('2026-10-14T20:00:00Z');
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 2, focus: '[]', at: new Date('2026-10-14T20:00:00Z') });

  const result = tick(ctx.db, sample, 'hq-lanes');

  expect(result.slotCause.cause).toBe('triage');
  expect(quiet).toStrictEqual([]);
  expect(ctx.queued()).toStrictEqual([
    { target: 'z-triage', text: 'Lanes: 90 slot-minutes empty today with no Ready work and Backlog issues waiting to be promoted (triage). Free slots: 3.' },
    { target: 'z-stu', text: 'Lanes: 90 slot-minutes empty today with no Ready work and no Backlog issue to promote (supply). Free slots: 3.' },
  ]);
});

test('it adds a look to the Sydney day it falls in, with no split at midnight', async () => {
  const ctx = setupTest();
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  at('2026-10-14T12:59:00Z');
  await ctx.seedReady([]);
  writePromotableFocus(ctx.db, { count: 0, focus: '[]', at: new Date('2026-10-14T12:59:00Z') });
  tick(ctx.db, sample, 'hq-lanes');
  at('2026-10-14T13:03:00Z');

  tick(ctx.db, sample, 'hq-lanes');

  expect(readSlotMinutes(ctx.db, '2026-10-14').supply).toBe(0);
  expect(readSlotMinutes(ctx.db, '2026-10-15').supply).toBe(12);
});
