import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readDoneOpenIssues } from './read-done-open-issues.ts';

test('it lists the In Progress issues whose every PR merged, with their last merge, and no other', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  for (const issue of ['GEO-9801', 'GEO-9802', 'GEO-9803', 'GEO-9804']) {
    fresh.db.run(`INSERT INTO linear_started (issue, started_at, fetched_at) VALUES ('${issue}', '2026-10-10T01:00:00Z', '2026-10-16T01:00:00Z')`);
  }
  fresh.db.run(`INSERT INTO linear_started_prs (issue, ref, status, merged_at) VALUES
    ('GEO-9801', 'kettle#1', 'merged', '2026-10-12T01:00:00Z'), ('GEO-9801', 'kettle#2', 'merged', '2026-10-13T01:00:00Z'),
    ('GEO-9802', 'kettle#3', 'merged', '2026-10-12T01:00:00Z'), ('GEO-9802', 'kettle#4', 'open', NULL),
    ('GEO-9803', 'kettle#5', 'closed', NULL)`);

  expect(readDoneOpenIssues(fresh.db)).toStrictEqual(new Map([['GEO-9801', '2026-10-13T01:00:00Z']]));
});
