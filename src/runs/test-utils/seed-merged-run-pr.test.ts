import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedRun } from './seed-run.ts';
import { seedMergedRunPR } from './seed-merged-run-pr.ts';

test('#seedMergedRunPR adds a merged PR to the run, and input overrides apply', () => {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  seedRun(fresh, { issue: 'GEO-9002' });

  seedMergedRunPR(fresh, { issue: 'GEO-9002', ref: 'kettle#7' });

  expect(fresh.db.query('SELECT ref, issue, state, added_at FROM run_prs').all()).toStrictEqual([{ ref: 'kettle#7', issue: 'GEO-9002', state: 'merged', added_at: '2026-10-14T01:00:00Z' }]);
});

test('#seedMergedRunPR merges the PR at the given time', () => {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  seedRun(fresh, { issue: 'GEO-9002' });

  seedMergedRunPR(fresh, { issue: 'GEO-9002', ref: 'kettle#7', mergedAt: '2026-10-13T22:00:00Z' });

  expect(fresh.db.query('SELECT merged_at FROM run_prs').all()).toStrictEqual([{ merged_at: '2026-10-13T22:00:00Z' }]);
});
