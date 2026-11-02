import { expect, onTestFinished, test } from 'bun:test';
import rulesTable from '../../lanes.json';
import { buildReadyPage, makePagedCall } from '../../test/build-ready-page.ts';
import type { ReadyNodeSeed } from '../../test/build-ready-page.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { setMeta } from '../db/set-meta.ts';
import { holdLanes } from './hold-lanes.ts';
import { readLinearReady } from './read-linear-ready.ts';
import { tick } from './tick.ts';
import { validateLaneRules } from './validate-lane-rules.ts';
import { writePromotableFocus } from './write-promotable-focus.ts';
import { writePromotableTop } from './write-promotable-top.ts';

// Each sample has three local slots and no imp ones, so the pool holds three free slots and the mark is 3.
function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const rules = validateLaneRules(rulesTable, null);
  const sample = { cap: { imp: { freeMib: 0, room: true } }, impMib: 2048, error: null, slots: { imp: 0, local: 3 } };
  const ready = async (count: number): Promise<void> => {
    const seeds: ReadyNodeSeed[] = Array.from({ length: count }, (_, i) => ({ identifier: `GEO-98${i}0`, project: 'kettle roadmap', type: 'Feature', labels: ['atc'], priority: 1 }));
    await readLinearReady(fresh.db, { call: makePagedCall(buildReadyPage(seeds, null)), run: buildStubGitHubFactsRunner({}), actor: 'hq-lanes', rules });
  };
  const promotable = (count: number, readAt: string, focus = '[]'): void => {
    writePromotableFocus(fresh.db, { count, focus, at: new Date(readAt), error: null });
    writePromotableTop(fresh.db, {
      issues: [
        { identifier: 'GEO-9701', title: 'whistle the kettle' },
        { identifier: 'GEO-9702', title: 'descale the kettle' },
      ],
      focus,
      at: new Date(readAt),
    });
  };
  const lowWater = () => fresh.db.query("SELECT target, text FROM outbox WHERE text LIKE 'Lanes: % eligible Ready for%' ORDER BY id").all();
  const stalled = () => fresh.db.query("SELECT target, text FROM outbox WHERE text LIKE 'Lanes: % slots empty for%' ORDER BY id").all();
  return { db: fresh.db, sample, ready, promotable, lowWater, stalled };
}

const LOW_TEXT = 'Lanes: 1 eligible Ready for 3 free slots (mark 3). Promote now: GEO-9701 whistle the kettle; GEO-9702 descale the kettle. Run hq lanes promotable for the rest.';

test('it tells z-triage once with the stored list when eligible work is under the mark and promotable issues wait', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.ready(1);
  ctx.promotable(2, '2026-10-14T01:00:00Z');

  tick(ctx.db, ctx.sample, 'hq-lanes');
  const first = ctx.lowWater();
  at('2026-10-14T01:05:00Z');
  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(first).toStrictEqual([{ target: 'z-triage', text: LOW_TEXT }]);
  expect(ctx.lowWater()).toStrictEqual(first);
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE subject_id LIKE 'low-water:%'").get()).toStrictEqual({ total: 1 });
});

test('it sends again when eligible work returns to the mark and then drops under it', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.ready(1);
  ctx.promotable(2, '2026-10-14T01:00:00Z');
  tick(ctx.db, ctx.sample, 'hq-lanes');
  at('2026-10-14T01:05:00Z');
  await ctx.ready(3);
  tick(ctx.db, ctx.sample, 'hq-lanes');
  at('2026-10-14T01:10:00Z');
  await ctx.ready(1);

  tick(ctx.db, ctx.sample, 'hq-lanes');

  // An unsent message on the topic gives way to the newer one, so the two sends show in the events.
  expect(ctx.db.query("SELECT subject_id FROM events WHERE subject_id LIKE 'low-water:%' ORDER BY seq").all()).toStrictEqual([{ subject_id: 'low-water:2026-10-14T01:00:00Z' }, { subject_id: 'low-water:2026-10-14T01:10:00Z' }]);
});

test('it sends nothing when the promotable count is 0', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.ready(1);
  ctx.promotable(0, '2026-10-14T01:00:00Z');

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.lowWater()).toStrictEqual([]);
});

test('it sends nothing when the promotable count is stale', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.ready(1);
  ctx.promotable(2, '2026-10-14T00:20:00Z');

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.lowWater()).toStrictEqual([]);
});

test('it sends nothing when the promotable count is for another focus', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.ready(1);
  ctx.promotable(2, '2026-10-14T01:00:00Z', '["bug"]');

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.lowWater()).toStrictEqual([]);
});

test('it leaves the list out when none is stored', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.ready(1);
  writePromotableFocus(ctx.db, { count: 2, focus: '[]', at: new Date('2026-10-14T01:00:00Z'), error: null });

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.lowWater()).toStrictEqual([{ target: 'z-triage', text: 'Lanes: 1 eligible Ready for 3 free slots (mark 3). Run hq lanes promotable for the rest.' }]);
});

test('it sends the low-water message during quiet hours', async () => {
  const ctx = setupTest();
  at('2026-10-14T17:00:00Z');
  await ctx.ready(1);
  ctx.promotable(2, '2026-10-14T17:00:00Z');

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.lowWater()).toHaveLength(1);
});

test('it sends nothing to z-stu at 29 minutes, one message at 30, and none later in the same cause episode', async () => {
  const ctx = setupTest();
  const lookAt = async (time: string): Promise<void> => {
    at(time);
    await ctx.ready(0);
    ctx.promotable(2, time);
    tick(ctx.db, ctx.sample, 'hq-lanes');
  };
  await lookAt('2026-10-14T01:00:00Z');
  await lookAt('2026-10-14T01:29:00Z');
  const at29 = ctx.stalled();
  await lookAt('2026-10-14T01:30:00Z');
  const at30 = ctx.stalled();
  await lookAt('2026-10-14T01:40:00Z');

  expect(at29).toStrictEqual([]);
  expect(at30).toStrictEqual([{ target: 'z-stu', text: 'Lanes: 3 slots empty for 30 min with Backlog issues to promote (triage). z-triage got the low-water message at 12:00.' }]);
  expect(ctx.stalled()).toStrictEqual(at30);
});

test('it says when z-triage got the low-water message in the stalled message', async () => {
  const ctx = setupTest();
  const lookAt = async (time: string): Promise<void> => {
    at(time);
    await ctx.ready(1);
    ctx.promotable(2, time);
    tick(ctx.db, ctx.sample, 'hq-lanes');
  };
  await lookAt('2026-10-14T01:00:00Z');
  at('2026-10-14T01:05:00Z');
  await ctx.ready(0);
  ctx.promotable(2, '2026-10-14T01:05:00Z');
  tick(ctx.db, ctx.sample, 'hq-lanes');
  at('2026-10-14T01:36:00Z');
  await ctx.ready(0);
  ctx.promotable(2, '2026-10-14T01:36:00Z');

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect(ctx.stalled()).toStrictEqual([{ target: 'z-stu', text: 'Lanes: 3 slots empty for 31 min with Backlog issues to promote (triage). z-triage got the low-water message at 12:00.' }]);
});

test('it sends again for a new triage cause episode', async () => {
  const ctx = setupTest();
  const lookAt = async (time: string, eligible: number): Promise<void> => {
    at(time);
    await ctx.ready(eligible);
    ctx.promotable(2, time);
    tick(ctx.db, ctx.sample, 'hq-lanes');
  };
  await lookAt('2026-10-14T01:00:00Z', 0);
  await lookAt('2026-10-14T01:31:00Z', 0);
  await lookAt('2026-10-14T01:35:00Z', 3);
  await lookAt('2026-10-14T01:40:00Z', 0);
  await lookAt('2026-10-14T02:11:00Z', 0);

  expect(ctx.stalled()).toHaveLength(2);
});

test('it sends neither message while a lanes hold is active', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  holdLanes(ctx.db, 120, 'host switch', 'kettle-owner');
  await ctx.ready(0);
  ctx.promotable(2, '2026-10-14T01:00:00Z');
  tick(ctx.db, ctx.sample, 'hq-lanes');
  at('2026-10-14T01:31:00Z');
  await ctx.ready(0);
  ctx.promotable(2, '2026-10-14T01:31:00Z');

  tick(ctx.db, ctx.sample, 'hq-lanes');

  expect([ctx.lowWater(), ctx.stalled()]).toStrictEqual([[], []]);
});

test('it sends nothing while the look has a sample error', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.ready(1);
  ctx.promotable(2, '2026-10-14T01:00:00Z');
  setMeta(ctx.db, 'lanes_low_water_since', null);

  tick(ctx.db, { ...ctx.sample, error: 'atc down' }, 'hq-lanes');

  expect(ctx.lowWater()).toStrictEqual([]);
});
