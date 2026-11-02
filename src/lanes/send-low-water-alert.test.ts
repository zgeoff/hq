import { expect, onTestFinished, test } from 'bun:test';
import { createLanesLook } from '../../test/create-lanes-look.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { holdLanes } from './hold-lanes.ts';
import { tick } from './tick.ts';

// Each look has three free slots, so the mark is 3.
function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, look: createLanesLook(fresh.db), lowWaterText: 'Lanes: 1 eligible Ready for 3 free slots (mark 3). Promote now: GEO-9701 whistle the kettle; GEO-9702 descale the kettle. Run hq lanes promotable for the rest.' };
}

test('it tells z-triage once with the stored list when eligible work is under the mark and promotable issues wait', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.look.ready(1);
  ctx.look.promotable(2, '2026-10-14T01:00:00Z');

  tick(ctx.db, ctx.look.sample, 'hq-lanes');
  const first = ctx.look.lowWater();
  at('2026-10-14T01:05:00Z');
  tick(ctx.db, ctx.look.sample, 'hq-lanes');

  expect(first).toStrictEqual([{ target: 'z-triage', text: ctx.lowWaterText }]);
  expect(ctx.look.lowWater()).toStrictEqual(first);
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE subject_id LIKE 'low-water:%'").get()).toStrictEqual({ total: 1 });
});

test('it sends again when eligible work returns to the mark and then drops under it', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.look.ready(1);
  ctx.look.promotable(2, '2026-10-14T01:00:00Z');
  tick(ctx.db, ctx.look.sample, 'hq-lanes');
  at('2026-10-14T01:05:00Z');
  await ctx.look.ready(3);
  tick(ctx.db, ctx.look.sample, 'hq-lanes');
  at('2026-10-14T01:10:00Z');
  await ctx.look.ready(1);

  tick(ctx.db, ctx.look.sample, 'hq-lanes');

  // An unsent message on the topic gives way to the newer one, so the two sends show in the events.
  expect(ctx.db.query("SELECT subject_id FROM events WHERE subject_id LIKE 'low-water:%' ORDER BY seq").all()).toStrictEqual([{ subject_id: 'low-water:2026-10-14T01:00:00Z' }, { subject_id: 'low-water:2026-10-14T01:10:00Z' }]);
  expect(ctx.db.query("SELECT outbox.target, outbox.text, events.subject_id FROM outbox JOIN events ON events.seq = outbox.event_seq WHERE outbox.topic = 'lanes-low-water'").all()).toStrictEqual([{ target: 'z-triage', text: ctx.lowWaterText, subject_id: 'low-water:2026-10-14T01:10:00Z' }]);
});

test('it sends nothing when the promotable count is 0', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.look.ready(1);
  ctx.look.promotable(0, '2026-10-14T01:00:00Z');

  tick(ctx.db, ctx.look.sample, 'hq-lanes');

  expect(ctx.look.lowWater()).toStrictEqual([]);
});

test('it sends nothing when the promotable count is stale', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.look.ready(1);
  ctx.look.promotable(2, '2026-10-14T00:20:00Z');

  tick(ctx.db, ctx.look.sample, 'hq-lanes');

  expect(ctx.look.lowWater()).toStrictEqual([]);
});

test('it sends nothing when the promotable count is for another focus', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.look.ready(1);
  ctx.look.promotable(2, '2026-10-14T01:00:00Z', { focus: '["bug"]' });

  tick(ctx.db, ctx.look.sample, 'hq-lanes');

  expect(ctx.look.lowWater()).toStrictEqual([]);
});

test('it leaves the list out when none is stored', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.look.ready(1);
  ctx.look.promotable(2, '2026-10-14T01:00:00Z', { list: false });

  tick(ctx.db, ctx.look.sample, 'hq-lanes');

  expect(ctx.look.lowWater()).toStrictEqual([{ target: 'z-triage', text: 'Lanes: 1 eligible Ready for 3 free slots (mark 3). Run hq lanes promotable for the rest.' }]);
});

test('it sends during quiet hours', async () => {
  const ctx = setupTest();
  at('2026-10-14T17:00:00Z');
  await ctx.look.ready(1);
  ctx.look.promotable(2, '2026-10-14T17:00:00Z');

  tick(ctx.db, ctx.look.sample, 'hq-lanes');

  expect(ctx.look.lowWater()).toHaveLength(1);
});

test('it sends nothing while a lanes hold is active', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  holdLanes(ctx.db, 120, 'host switch', 'kettle-owner');
  await ctx.look.ready(1);
  ctx.look.promotable(2, '2026-10-14T01:00:00Z');

  tick(ctx.db, ctx.look.sample, 'hq-lanes');

  expect(ctx.look.lowWater()).toStrictEqual([]);
});

test('it sends nothing while the look has a sample error', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  await ctx.look.ready(1);
  ctx.look.promotable(2, '2026-10-14T01:00:00Z');

  tick(ctx.db, { ...ctx.look.sample, error: 'atc down' }, 'hq-lanes');

  expect(ctx.look.lowWater()).toStrictEqual([]);
});
