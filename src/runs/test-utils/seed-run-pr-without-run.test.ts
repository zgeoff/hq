import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedRunPrWithoutRun } from './seed-run-pr-without-run.ts';

test('#seedRunPrWithoutRun stores an open PR whose issue has no run', () => {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);

  seedRunPrWithoutRun(fresh, { ref: 'widgets#7', reviewRound: 1 });

  expect([fresh.db.query('SELECT ref, issue, state, review_round FROM run_prs').all(), fresh.db.query('SELECT COUNT(*) AS count FROM runs').get()]).toStrictEqual([[{ ref: 'widgets#7', issue: 'GEO-1', state: 'open', review_round: 1 }], { count: 0 }]);
});
