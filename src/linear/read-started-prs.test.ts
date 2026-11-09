import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readStartedPRs } from './read-started-prs.ts';
import { seedStartedPR } from './test-utils/seed-started-pr.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it groups the stored PRs by issue', () => {
  const ctx = setupTest();
  seedStartedPR(ctx, { issue: 'GEO-9801', ref: 'kettle#2', status: 'open', merged_at: null });
  seedStartedPR(ctx, { issue: 'GEO-9801', ref: 'kettle#1', status: 'merged', merged_at: '2026-10-14T01:00:00Z' });
  seedStartedPR(ctx, { issue: 'GEO-9802', ref: 'teapot#3', status: 'closed', merged_at: null });

  expect(readStartedPRs(ctx.db)).toStrictEqual(
    new Map([
      [
        'GEO-9801',
        [
          { ref: 'kettle#1', status: 'merged', mergedAt: '2026-10-14T01:00:00Z' },
          { ref: 'kettle#2', status: 'open', mergedAt: null },
        ],
      ],
      ['GEO-9802', [{ ref: 'teapot#3', status: 'closed', mergedAt: null }]],
    ]),
  );
});
