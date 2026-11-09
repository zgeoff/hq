import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedRun } from './seed-run.ts';
import { seedClosedRunPr } from './seed-closed-run-pr.ts';

test('#seedClosedRunPr adds a closed PR to the run, and input overrides apply', () => {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  seedRun(fresh, { issue: 'GEO-9002' });

  seedClosedRunPr(fresh, { issue: 'GEO-9002', ref: 'kettle#7' });

  expect(fresh.db.query('SELECT ref, issue, state, added_at FROM run_prs').all()).toStrictEqual([{ ref: 'kettle#7', issue: 'GEO-9002', state: 'closed', added_at: '2026-10-14T01:00:00Z' }]);
});
