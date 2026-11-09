import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';
import { reviewedPR } from './reviewed-pr.ts';
import { writeReviewStarted } from './write-review-started.ts';

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

test('it marks an open PR on a run as started, leaving its round and head alone', () => {
  const ctx = setupTest();
  ctx.seed.run({ issue: 'GEO-9701' });
  ctx.seed.runPR({ issue: 'GEO-9701', ref: 'widgets#7' });
  reviewedPR(ctx.db, { raw: 'widgets#7', sha: 'abc1234', recheck: false, force: false }, 'kettle-review');

  writeReviewStarted(ctx.db, 'widgets', 7);

  expect(ctx.readPR()).toStrictEqual({ started: 1, reviewed_sha: 'abc1234', review_round: 1 });
  expect(ctx.readActions()).toStrictEqual(['review-started by hq review']);
});

test('it leaves a merged PR alone', () => {
  const ctx = setupTest();
  ctx.seed.run({ issue: 'GEO-9701' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9701', ref: 'widgets#7' });

  writeReviewStarted(ctx.db, 'widgets', 7);

  expect(ctx.readPR()).toStrictEqual({ started: 0, reviewed_sha: null, review_round: 0 });
  expect(ctx.readActions()).toStrictEqual([]);
});

test('it does nothing for a PR on no run', () => {
  const ctx = setupTest();

  writeReviewStarted(ctx.db, 'widgets', 7);

  expect(ctx.readActions()).toStrictEqual([]);
});
