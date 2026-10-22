import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { writeSkipMove } from './write-skip-move.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it stores a set skip in issue order and logs the move with its states', () => {
  const ctx = setupTest();
  writeSkipMove(ctx.db, 'skip-set', { issue: 'GEO-9872', until: 'GEO-9879', reason: 'waits on the descaler PR', by: 'z-delivery', at: '2026-10-15T20:00:00Z' }, 'z-delivery');

  writeSkipMove(ctx.db, 'skip-set', { issue: 'GEO-9871', until: '2026-10-16T09:00:00Z', reason: 'held for the vendor', by: 'z-delivery', at: '2026-10-15T20:00:00Z' }, 'z-delivery');

  expect(readLaneSkips(ctx.db).map((skip) => skip.issue)).toStrictEqual(['GEO-9871', 'GEO-9872']);
  expect(ctx.db.query("SELECT from_state, to_state FROM events WHERE action = 'skip-set' ORDER BY seq").all()).toStrictEqual([
    { from_state: 'none', to_state: 'active' },
    { from_state: 'none', to_state: 'active' },
  ]);
});

test('it refuses to end a skip the issue does not have, and writes nothing', () => {
  const ctx = setupTest();

  expect(() => writeSkipMove(ctx.db, 'skip-ended', { issue: 'GEO-9871', until: 'GEO-9879', reason: 'waits on the descaler PR', by: 'z-delivery', at: '2026-10-15T20:00:00Z' }, 'hq-lanes')).toThrow(
    expect.objectContaining({ code: 'bad_state', message: 'GEO-9871 has no skip, so skip-ended cannot apply' }),
  );
  expect(ctx.db.query("SELECT count(*) AS total FROM events WHERE action = 'skip-ended'").get()).toStrictEqual({ total: 0 });
});
