import { expect, test } from 'bun:test';
import { buildRenderedReport } from '../../test/build-rendered-report.ts';
import { formatReportTitle } from './format-report-title.ts';

test('a day\'s title counts its PRs, repos and issues; a week\'s adds the lines changed', () => {
  expect([
    formatReportTitle(buildRenderedReport({ totals: { prs: 1, repos: 1, issues: 1, added: 0, removed: 0, closed: 0 } })),
    formatReportTitle(buildRenderedReport({ kind: 'weekly', dateLabel: 'Monday 12 October', totals: { prs: 6, repos: 2, issues: 4, added: 12_345, removed: 999, closed: 2 } })),
  ]).toStrictEqual(['Thursday 15 October: 1 PR across 1 repo, covering 1 issue, 0 closed.', 'Week of Monday 12 October: 6 PRs across 2 repos, covering 4 issues, 2 closed. +12,345 −999.']);
});
