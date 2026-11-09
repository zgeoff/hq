import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { readSlotRows } from './read-slot-rows.ts';
import { buildFleetSeeder } from './test-utils/build-fleet-seeder.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, seed: buildFleetSeeder(fresh) };
}

test('it returns the stored rows of all four slots in slot order', () => {
  const ctx = setupTest();
  ctx.seed.slotUsage({ at: '2026-10-14T01:00:00Z', slot: 4, status: 'op-failed', five: null, seven: null, sevenResetsAt: null, workingLanes: 1 });
  ctx.seed.slotUsage({ at: '2026-10-14T01:00:00Z', slot: 2, five: 20, seven: 40, sevenResetsAt: null, workingLanes: 1 });
  ctx.seed.slotUsage({ at: '2026-10-14T01:00:00Z', slot: 3, five: 10, seven: 30, sevenResetsAt: null, workingLanes: 1 });
  ctx.seed.slotUsage({ at: '2026-10-14T01:00:00Z', slot: 1, status: '401', five: null, seven: null, sevenResetsAt: null, workingLanes: 1 });

  const rows = readSlotRows(ctx.db, new Date('2026-10-14T00:00:00Z'), new Date('2026-10-14T02:00:00Z'));

  expect(rows.map((row) => row.slot)).toStrictEqual([1, 2, 3, 4]);
});
