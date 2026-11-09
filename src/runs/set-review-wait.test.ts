import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';
import { setReviewWait } from './set-review-wait.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, seed: buildSeeder(fresh) };
}

test('it logs a review wait with no state move and the sha, until and reason in its data', () => {
  const ctx = setupTest();
  at('2026-10-21T01:00:00Z');
  ctx.seed.run({ issue: 'GEO-9861' });
  ctx.seed.finalRunPR({ issue: 'GEO-9861', ref: 'kettle#61', sha: 'abc1234' });

  setReviewWait(ctx.db, 'kettle#61', { clear: false, until: '2026-10-22T01:00:00Z', reason: 'the only reviewer is out of quota' }, 'kettle-bot');

  expect(ctx.db.query("SELECT actor, from_state, to_state, data FROM events WHERE subject_id = 'GEO-9861' AND action = 'review-wait'").all()).toStrictEqual([
    { actor: 'kettle-bot', from_state: null, to_state: null, data: JSON.stringify({ ref: 'kettle#61', sha: 'abc1234', until: '2026-10-22T01:00:00Z', reason: 'the only reviewer is out of quota' }) },
  ]);
});
