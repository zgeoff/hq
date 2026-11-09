import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedRunPRWithoutRun } from './seed-run-pr-without-run.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    readPRs: () => fresh.db.query('SELECT ref, issue, state, review_round, added_at FROM run_prs').all(),
    readRunCount: () => fresh.db.query('SELECT COUNT(*) AS count FROM runs').get(),
    readForeignKeys: () => fresh.db.query('PRAGMA foreign_keys').get(),
  };
}

test('#seedRunPRWithoutRun stores an open PR whose issue has no run, and input overrides apply', () => {
  const ctx = setupTest();

  seedRunPRWithoutRun(ctx, { ref: 'widgets#7', issue: 'GEO-1', review_round: 1 });

  expect([ctx.readPRs(), ctx.readRunCount()]).toStrictEqual([[{ ref: 'widgets#7', issue: 'GEO-1', state: 'open', review_round: 1, added_at: '2026-10-14T01:00:00Z' }], { count: 0 }]);
});

test('#seedRunPRWithoutRun leaves foreign keys enforced on the connection', () => {
  const ctx = setupTest();

  seedRunPRWithoutRun(ctx);

  expect(ctx.readForeignKeys()).toStrictEqual({ foreign_keys: 1 });
});
