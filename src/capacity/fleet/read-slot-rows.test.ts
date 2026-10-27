import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { readSlotRows } from './read-slot-rows.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it leaves out the stored rows of a slot that is no longer read', () => {
  const ctx = setupTest();
  const insert = ctx.db.query('INSERT INTO slot_usage (at, slot, status, five_hour, five_hour_resets_at, seven_day, seven_day_resets_at, working_lanes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insert.run('2026-10-14T01:00:00Z', 3, '200', 10, null, 30, null, 1);
  insert.run('2026-10-14T01:00:00Z', 4, 'op-failed', null, null, null, null, 1);

  const rows = readSlotRows(ctx.db, new Date('2026-10-14T00:00:00Z'), new Date('2026-10-14T02:00:00Z'));

  expect(rows.map((row) => row.slot)).toStrictEqual([3]);
});
