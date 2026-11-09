import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedFinalRunPR } from './seed-final-run-pr.ts';
import { seedRun } from './seed-run.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readPRs: () => fresh.db.query('SELECT ref, issue, state, final_sha, final_at, final_source FROM run_prs').all() };
}

test('#seedFinalRunPR adds an open PR marked final at the current time, and input overrides apply', () => {
  const ctx = setupTest();
  at(NOON_SYDNEY);
  seedRun(ctx, { issue: 'GEO-9002' });

  seedFinalRunPR(ctx, { issue: 'GEO-9002', ref: 'kettle#7', sha: 'def5678', source: 'cli:kettle-bot' });

  expect(ctx.readPRs()).toStrictEqual([{ ref: 'kettle#7', issue: 'GEO-9002', state: 'open', final_sha: 'def5678', final_at: '2026-10-14T01:00:00Z', final_source: 'cli:kettle-bot' }]);
});

test('#seedFinalRunPR marks the PR final at abc1234 from a kettle marker by default', () => {
  const ctx = setupTest();
  at(NOON_SYDNEY);
  seedRun(ctx, { issue: 'GEO-9001' });

  seedFinalRunPR(ctx);

  expect(ctx.readPRs()).toMatchObject([{ ref: 'kettle#1', final_sha: 'abc1234', final_source: 'marker:kettle' }]);
});
