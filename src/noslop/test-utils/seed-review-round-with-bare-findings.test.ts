import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedReviewRoundWithBareFindings } from './seed-review-round-with-bare-findings.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRounds: () => fresh.db.query('SELECT repo, pr, kind, started_at, ok, findings FROM noslop_rounds ORDER BY id').all() };
}

test('#seedReviewRoundWithBareFindings stores the findings without the fields added later, and input overrides apply', () => {
  const ctx = setupTest();

  seedReviewRoundWithBareFindings(ctx, { pr: 9, findings: [{ id: 'aaaaaaaaaaaaaaaa', lens: 'correctness', severity: 'high', title: 'Kettle never boils' }] });

  expect(ctx.readRounds()).toStrictEqual([
    { repo: 'widgets', pr: 9, kind: 'review', started_at: '2026-10-14T00:59:00Z', ok: 1, findings: '[{"id":"aaaaaaaaaaaaaaaa","lens":"correctness","severity":"high","title":"Kettle never boils"}]' },
  ]);
});
