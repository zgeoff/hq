import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readStartedPrs } from './read-started-prs.ts';

test('it groups the stored PRs by issue', () => {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  fresh.db.run(`INSERT INTO linear_started_prs (issue, ref, status, merged_at) VALUES ('GEO-9801', 'kettle#2', 'open', NULL), ('GEO-9801', 'kettle#1', 'merged', '2026-10-14T01:00:00Z'), ('GEO-9802', 'teapot#3', 'closed', NULL)`);

  expect(readStartedPrs(fresh.db)).toStrictEqual(
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
