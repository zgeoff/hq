import { expect, test } from 'bun:test';
import { mergedPRsOutputSchema } from '../src/shipped/merged-prs-output-schema.ts';
import { parseMergedPRs } from '../src/shipped/parse-merged-prs.ts';
import { buildMergedDayOutput, buildMergedPR } from './build-merged-day-output.ts';

test('the built output is one parseMergedPRs accepts, with a PR field given replacing its default', () => {
  const listed = [buildMergedPR(), buildMergedPR({ number: 42, issue: null })],
    parsed = parseMergedPRs(buildMergedDayOutput('2026-10-15', listed));

  expect([parsed.prs, parsed.start, parsed.searchCount, parsed.fetched]).toStrictEqual([listed, '2026-10-15T00:00:00+11:00', 2, 2]);
});

test('the built output lists each issue once, with its PRs, and the PRs with no issue apart', () => {
  const listed = [buildMergedPR({ number: 41 }), buildMergedPR({ number: 42 }), buildMergedPR({ number: 43, issue: null })],
    output = mergedPRsOutputSchema.parse(JSON.parse(buildMergedDayOutput('2026-10-15', listed)));

  expect(output.byIssue.map((entry) => [entry.issue, entry.prs.map((pr) => pr.number)])).toStrictEqual([['GEO-9801', [41, 42]]]);
  expect(output.noIssue.map((pr) => pr.number)).toStrictEqual([43]);
});

test('the built output totals each repo and each issue from its PRs, the most PRs first', () => {
  const listed = [buildMergedPR({ number: 41, issue: 'GEO-9802' }), buildMergedPR({ number: 42, repo: 'lantern', added: 5, removed: 1 }), buildMergedPR({ number: 43, repo: 'lantern', added: 1, removed: 0 })],
    output = parseMergedPRs(buildMergedDayOutput('2026-10-15', listed));

  expect([output.totals, output.byRepo, output.byIssue]).toStrictEqual([
    { prs: 3, issues: 2, repos: 2, added: 16, removed: 3 },
    [
      { repo: 'lantern', prs: 2, added: 6, removed: 1 },
      { repo: 'kettle', prs: 1, added: 10, removed: 2 },
    ],
    [
      {
        issue: 'GEO-9801',
        repos: ['lantern'],
        added: 6,
        removed: 1,
        prs: [
          { repo: 'lantern', number: 42, url: 'https://github.com/zgeoff/kettle/pull/41' },
          { repo: 'lantern', number: 43, url: 'https://github.com/zgeoff/kettle/pull/41' },
        ],
      },
      { issue: 'GEO-9802', repos: ['kettle'], added: 10, removed: 2, prs: [{ repo: 'kettle', number: 41, url: 'https://github.com/zgeoff/kettle/pull/41' }] },
    ],
  ]);
});
