import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedLanesNudge } from './seed-lanes-nudge.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readNudges: () => fresh.db.query('SELECT at, slots, free_minutes, eligible, event_seq, slots_after, checked_at, detail FROM lanes_nudges').all() };
}

test('#seedLanesNudge stores a nudge not yet followed up, on its own event, and input overrides apply', () => {
  const ctx = setupTest();

  const id = seedLanesNudge(ctx, { at: '2026-10-16T01:11:00Z', slots: 1, eligible: null });

  expect([id, ctx.readNudges()]).toStrictEqual([1, [{ at: '2026-10-16T01:11:00Z', slots: 1, free_minutes: 10, eligible: null, event_seq: 1, slots_after: null, checked_at: null, detail: null }]]);
});
