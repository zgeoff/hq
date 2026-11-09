import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';
import { reviewedPr } from './reviewed-pr.ts';
import { writeReviewed } from './write-reviewed.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  return {
    db: fresh.db,
    seed: buildSeeder(fresh),
    readPR: () => fresh.db.query("SELECT review_started_at IS NOT NULL AS started, reviewed_sha, review_round FROM run_prs WHERE ref = 'widgets#7'").get(),
    readActions: () =>
      z
        .array(z.object({ action: z.string(), actor: z.string() }))
        .parse(fresh.db.query("SELECT action, actor FROM events WHERE subject = 'run' AND actor = 'hq review' ORDER BY seq").all())
        .map((row) => `${row.action} by ${row.actor}`),
  };
}

test('it marks an open PR on a run as reviewed at the head with the next round', () => {
  const ctx = setupTest();
  ctx.seed.run({ issue: 'GEO-9701' });
  ctx.seed.runPr({ issue: 'GEO-9701', ref: 'widgets#7' });
  reviewedPr(ctx.db, 'widgets#7', 'abc1234', { recheck: false, force: false }, 'kettle-review');

  writeReviewed(ctx.db, 'widgets', 7, { head: '0123456789abcdef0123456789abcdef01234567', countsRound: true });

  expect(ctx.readPR()).toStrictEqual({ started: 0, reviewed_sha: '0123456789abcdef0123456789abcdef01234567', review_round: 2 });
  expect(ctx.readActions()).toStrictEqual(['reviewed by hq review']);
});

test('it counts a round past round 2, since no round limit applies', () => {
  const ctx = setupTest();
  ctx.seed.run({ issue: 'GEO-9701' });
  ctx.seed.runPr({ issue: 'GEO-9701', ref: 'widgets#7' });
  reviewedPr(ctx.db, 'widgets#7', 'abc1234', { recheck: false, force: false }, 'kettle-review');
  reviewedPr(ctx.db, 'widgets#7', 'abc1234', { recheck: true, force: false }, 'kettle-review');

  writeReviewed(ctx.db, 'widgets', 7, { head: '0123456789abcdef0123456789abcdef01234567', countsRound: true });

  expect(ctx.readPR()).toStrictEqual({ started: 0, reviewed_sha: '0123456789abcdef0123456789abcdef01234567', review_round: 3 });
});

test('it marks the head and keeps the round for a run that does not count as a round', () => {
  const ctx = setupTest();
  ctx.seed.run({ issue: 'GEO-9701' });
  ctx.seed.runPr({ issue: 'GEO-9701', ref: 'widgets#7' });
  reviewedPr(ctx.db, 'widgets#7', 'abc1234', { recheck: false, force: false }, 'kettle-review');

  writeReviewed(ctx.db, 'widgets', 7, { head: '0123456789abcdef0123456789abcdef01234567', countsRound: false });

  expect(ctx.readPR()).toStrictEqual({ started: 0, reviewed_sha: '0123456789abcdef0123456789abcdef01234567', review_round: 1 });
});

test('it leaves a merged PR alone', () => {
  const ctx = setupTest();
  ctx.seed.run({ issue: 'GEO-9701' });
  ctx.seed.mergedRunPr({ issue: 'GEO-9701', ref: 'widgets#7' });

  writeReviewed(ctx.db, 'widgets', 7, { head: '0123456789abcdef0123456789abcdef01234567', countsRound: true });

  expect(ctx.readPR()).toStrictEqual({ started: 0, reviewed_sha: null, review_round: 0 });
  expect(ctx.readActions()).toStrictEqual([]);
});

test('it does nothing for a PR on no run', () => {
  const ctx = setupTest();

  writeReviewed(ctx.db, 'widgets', 7, { head: '0123456789abcdef0123456789abcdef01234567', countsRound: true });

  expect(ctx.readActions()).toStrictEqual([]);
});
