import { expect, onTestFinished, test } from 'bun:test';
import { createLanesLook } from '../../test/create-lanes-look.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { holdLanes } from './hold-lanes.ts';
import { tick } from './tick.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const look = createLanesLook(fresh.db);

  const lookAt = async (time: string, eligible: number): Promise<void> => {
    at(time);
    await look.ready(eligible);
    look.promotable(2, time);
    tick(fresh.db, look.sample, 'hq-lanes');
  };
  return { db: fresh.db, look, lookAt };
}

test('it sends nothing to z-stu at 29 minutes, one message at 30, and none later in the same cause episode', async () => {
  const ctx = setupTest();
  await ctx.lookAt('2026-10-14T01:00:00Z', 0);
  await ctx.lookAt('2026-10-14T01:29:00Z', 0);
  const at29 = ctx.look.stalled();
  await ctx.lookAt('2026-10-14T01:30:00Z', 0);
  const at30 = ctx.look.stalled();
  await ctx.lookAt('2026-10-14T01:40:00Z', 0);

  expect(at29).toStrictEqual([]);
  expect(at30).toStrictEqual([{ target: 'z-stu', text: 'Lanes: 3 slots empty for 30 min with Backlog issues to promote (triage).' }]);
  expect(ctx.look.stalled()).toStrictEqual(at30);
});

test('it names when the low-water message reached z-triage, and leaves it out while the message waits', async () => {
  const ctx = setupTest();
  await ctx.lookAt('2026-10-14T01:00:00Z', 0);
  ctx.db.query("UPDATE outbox SET status = 'sent', sent_at = '2026-10-14T01:07:00Z' WHERE topic = 'lanes-low-water'").run();
  await ctx.lookAt('2026-10-14T01:30:00Z', 0);

  expect(ctx.look.stalled()).toStrictEqual([{ target: 'z-stu', text: 'Lanes: 3 slots empty for 30 min with Backlog issues to promote (triage). z-triage got the low-water message at 12:07.' }]);
});

test('it sends again for a new triage cause episode', async () => {
  const ctx = setupTest();
  await ctx.lookAt('2026-10-14T01:00:00Z', 0);
  await ctx.lookAt('2026-10-14T01:31:00Z', 0);
  await ctx.lookAt('2026-10-14T01:35:00Z', 3);
  await ctx.lookAt('2026-10-14T01:40:00Z', 0);
  await ctx.lookAt('2026-10-14T02:11:00Z', 0);

  expect(ctx.db.query("SELECT subject_id FROM events WHERE subject_id LIKE 'slot-cause-stalled:%' ORDER BY seq").all()).toStrictEqual([
    { subject_id: 'slot-cause-stalled:triage:2026-10-14T01:00:00Z' },
    { subject_id: 'slot-cause-stalled:triage:2026-10-14T01:40:00Z' },
  ]);
});

test('it sends during quiet hours', async () => {
  const ctx = setupTest();
  await ctx.lookAt('2026-10-14T17:00:00Z', 0);
  await ctx.lookAt('2026-10-14T17:30:00Z', 0);

  expect(ctx.look.stalled()).toHaveLength(1);
});

test('it sends neither message while a lanes hold is active', async () => {
  const ctx = setupTest();
  at('2026-10-14T01:00:00Z');
  holdLanes(ctx.db, 120, 'host switch', 'kettle-owner');
  await ctx.lookAt('2026-10-14T01:00:00Z', 0);
  await ctx.lookAt('2026-10-14T01:31:00Z', 0);

  expect([ctx.look.lowWater(), ctx.look.stalled()]).toStrictEqual([[], []]);
});
