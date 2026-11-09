import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../../test/helpers.ts';
import { seedSlotUsage } from './seed-slot-usage.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRows: () => fresh.db.query('SELECT at, slot, status, five_hour, five_hour_resets_at, seven_day, seven_day_resets_at, working_lanes FROM slot_usage ORDER BY slot').all() };
}

test('#seedSlotUsage stores one slot read, and input overrides apply', () => {
  const ctx = setupTest();

  seedSlotUsage(ctx, { slot: 3, seven: 99, workingLanes: 4 });

  expect(ctx.readRows()).toStrictEqual([{ at: '2026-10-14T00:30:00Z', slot: 3, status: '200', five_hour: 0, five_hour_resets_at: null, seven_day: 99, seven_day_resets_at: '2026-10-18T00:00:00Z', working_lanes: 4 }]);
});

test('#seedSlotUsage keeps a read for each slot', () => {
  const ctx = setupTest();

  seedSlotUsage(ctx, { slot: 1 });
  seedSlotUsage(ctx, { slot: 2 });

  expect(ctx.readRows()).toHaveLength(2);
});
