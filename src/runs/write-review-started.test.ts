import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { freshDb } from '../../test/helpers.ts';
import { writeReviewStarted } from './write-review-started.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    createRunPR: (state: string, round: number) => {
      fresh.db.query("INSERT INTO runs (issue, title, place, state, created_at, updated_at) VALUES ('GEO-9701', 'Fit the kettle lid', 'local', 'working', '2026-10-14T00:00:00Z', '2026-10-14T00:00:00Z')").run();
      fresh.db.query("INSERT INTO run_prs (ref, issue, state, review_round, added_at, updated_at) VALUES ('widgets#7', 'GEO-9701', ?, ?, '2026-10-14T00:00:00Z', '2026-10-14T00:00:00Z')").run(state, round);
    },
    readPR: () => fresh.db.query("SELECT review_started_at IS NOT NULL AS started, reviewed_sha, review_round FROM run_prs WHERE ref = 'widgets#7'").get(),
    readActions: () =>
      z
        .array(z.object({ action: z.string(), actor: z.string() }))
        .parse(fresh.db.query("SELECT action, actor FROM events WHERE subject = 'run' ORDER BY seq").all())
        .map((row) => `${row.action} by ${row.actor}`),
  };
}

test('it marks an open PR on a run as started, leaving its round and head alone', () => {
  const ctx = setupTest();
  ctx.createRunPR('open', 1);

  writeReviewStarted(ctx.db, 'widgets', 7);

  expect(ctx.readPR()).toStrictEqual({ started: 1, reviewed_sha: null, review_round: 1 });
  expect(ctx.readActions()).toStrictEqual(['review-started by hq review']);
});

test('it leaves a merged PR alone', () => {
  const ctx = setupTest();
  ctx.createRunPR('merged', 0);

  writeReviewStarted(ctx.db, 'widgets', 7);

  expect(ctx.readPR()).toStrictEqual({ started: 0, reviewed_sha: null, review_round: 0 });
  expect(ctx.readActions()).toStrictEqual([]);
});

test('it does nothing for a PR on no run', () => {
  const ctx = setupTest();

  writeReviewStarted(ctx.db, 'widgets', 7);

  expect(ctx.readActions()).toStrictEqual([]);
});
