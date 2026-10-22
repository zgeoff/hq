import { expect, test } from 'bun:test';
import { buildMergedPR } from '../../test/build-merged-day-output.ts';
import { mergeMergedDays } from './merge-merged-days.ts';
import type { MergedPRsOutput } from './merged-prs-output-schema.ts';

function buildDay(start: string, over: Partial<MergedPRsOutput>): MergedPRsOutput {
  return { kind: 'daily', start, end: start, searchCount: 0, fetched: 0, totals: { prs: 0, issues: 0, repos: 0, added: 0, removed: 0 }, byRepo: [], byIssue: [], noIssue: [], prs: [], workflow: [], ...over };
}

test('a week across the October daylight saving change starts at the old offset and ends at the new one', () => {
  const week = mergeMergedDays([buildDay('2026-09-28T00:00:00+10:00', {})]);

  expect([week.start, week.end]).toStrictEqual(['2026-09-28T00:00:00+10:00', '2026-10-04T23:59:59+11:00']);
});

test('PRs sort by repo then merge time, and issues with equal PR counts stay in issue order', () => {
  const early = buildMergedPR({ number: 2, repo: 'kettle', issue: 'GEO-9801', mergedAt: '2026-10-13T01:00:00Z' }),
    late = buildMergedPR({ number: 3, repo: 'kettle', issue: 'GEO-9802', mergedAt: '2026-10-13T05:00:00Z' }),
    other = buildMergedPR({ number: 1, repo: 'brewer', issue: 'GEO-9803', mergedAt: '2026-10-14T01:00:00Z' }),
    week = mergeMergedDays([buildDay('2026-10-12T00:00:00+11:00', { prs: [late] }), buildDay('2026-10-13T00:00:00+11:00', { prs: [other, early] })]);

  expect(week.prs.map((pr) => pr.number)).toStrictEqual([1, 2, 3]);
  expect(week.byIssue.map((entry) => entry.issue)).toStrictEqual(['GEO-9801', 'GEO-9802', 'GEO-9803']);
});

test('the same days merge to the same week', () => {
  const days = [buildDay('2026-10-12T00:00:00+11:00', { prs: [buildMergedPR({ number: 1 }), buildMergedPR({ number: 2, issue: null })] })];

  expect(mergeMergedDays(days)).toStrictEqual(mergeMergedDays(days));
});

test('hq\'s own PRs stay in the workflow list, by merge time, and out of every count', () => {
  const week = mergeMergedDays([
    buildDay('2026-10-12T00:00:00+11:00', { workflow: [{ repo: 'hq', number: 2, title: 'tune hq', url: 'https://github.com/zgeoff/hq/pull/2', mergedAt: '2026-10-12T05:00:00Z' }] }),
    buildDay('2026-10-13T00:00:00+11:00', { workflow: [{ repo: 'hq', number: 1, title: 'trim hq', url: 'https://github.com/zgeoff/hq/pull/1', mergedAt: '2026-10-13T01:00:00Z' }] }),
  ]);

  expect(week.workflow.map((pr) => pr.number)).toStrictEqual([2, 1]);
  expect(week.totals.prs).toBe(0);
});

test('the week\'s searchCount and fetched are each the sum of the days\' own', () => {
  const week = mergeMergedDays([buildDay('2026-10-12T00:00:00+11:00', { searchCount: 1200, fetched: 1000 }), buildDay('2026-10-13T00:00:00+11:00', { searchCount: 10, fetched: 10 })]);

  expect([week.searchCount, week.fetched]).toStrictEqual([1210, 1010]);
});
