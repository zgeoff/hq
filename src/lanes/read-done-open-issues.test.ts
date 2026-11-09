import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { seedStartedIssue } from '../linear/test-utils/seed-started-issue.ts';
import { seedStartedPR } from '../linear/test-utils/seed-started-pr.ts';
import { readDoneOpenIssues } from './read-done-open-issues.ts';

test('it lists the In Progress issues whose every PR merged, with their last merge, and no other', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  for (const issue of ['GEO-9801', 'GEO-9802', 'GEO-9803', 'GEO-9804']) {
    seedStartedIssue(fresh, { issue });
  }
  seedStartedPR(fresh, { issue: 'GEO-9801', ref: 'kettle#1', status: 'merged', merged_at: '2026-10-12T01:00:00Z' });
  seedStartedPR(fresh, { issue: 'GEO-9801', ref: 'kettle#2', status: 'merged', merged_at: '2026-10-13T01:00:00Z' });
  seedStartedPR(fresh, { issue: 'GEO-9802', ref: 'kettle#3', status: 'merged', merged_at: '2026-10-12T01:00:00Z' });
  seedStartedPR(fresh, { issue: 'GEO-9802', ref: 'kettle#4', status: 'open' });
  seedStartedPR(fresh, { issue: 'GEO-9803', ref: 'kettle#5', status: 'closed' });

  expect(readDoneOpenIssues(fresh.db)).toStrictEqual(new Map([['GEO-9801', '2026-10-13T01:00:00Z']]));
});
