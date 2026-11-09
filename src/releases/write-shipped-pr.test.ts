import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';
import { writeShippedPR } from './write-shipped-pr.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);
  return {
    db: fresh.db,
    seed: buildSeeder(fresh),
    readPR: (ref: string) => fresh.db.query('SELECT merge_sha, shipped_tag, shipped_at FROM run_prs WHERE ref = ?').get(ref),
  };
}

test('it records the merge commit, tag and ship time of a merged PR', () => {
  const ctx = setupTest();
  ctx.seed.run({ issue: 'GEO-9001' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9001', ref: 'kettle#1' });

  writeShippedPR(ctx.db, { ref: 'kettle#1', sha: 'c'.repeat(40), tag: 'kettle@1.0.0', at: '2026-10-15T00:00:00Z' });

  expect(ctx.readPR('kettle#1')).toStrictEqual({ merge_sha: 'c'.repeat(40), shipped_tag: 'kettle@1.0.0', shipped_at: '2026-10-15T00:00:00Z' });
});

test('it leaves the other PRs as they were', () => {
  const ctx = setupTest();
  ctx.seed.run({ issue: 'GEO-9001' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9001', ref: 'kettle#1' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9001', ref: 'kettle#2' });

  writeShippedPR(ctx.db, { ref: 'kettle#1', sha: 'c'.repeat(40), tag: null, at: '2026-10-15T00:00:00Z' });

  expect(ctx.readPR('kettle#2')).toStrictEqual({ merge_sha: null, shipped_tag: null, shipped_at: null });
});
