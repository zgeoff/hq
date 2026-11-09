import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedSlotMinutes } from './seed-slot-minutes.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRows: () => fresh.db.query('SELECT day, cause, minutes FROM slot_minutes ORDER BY day, cause').all() };
}

test('#seedSlotMinutes stores the minutes of one cause on one day, and input overrides apply', () => {
  const ctx = setupTest();

  seedSlotMinutes(ctx, { day: '2026-10-13', cause: 'supply', minutes: 99 });

  expect(ctx.readRows()).toStrictEqual([{ day: '2026-10-13', cause: 'supply', minutes: 99 }]);
});
