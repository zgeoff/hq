import type { MergedPR } from '../src/shipped/types.ts';

// A PR merged for GEO-9801 in the kettle repo at noon Sydney time on 15 Oct 2026; `over` replaces
// whole fields.
export function buildMergedPR(over: Partial<MergedPR> = {}): MergedPR {
  return {
    repo: 'kettle',
    number: 41,
    title: 'Fit the long spout for GEO-9801',
    url: 'https://github.com/zgeoff/kettle/pull/41',
    mergedAt: '2026-10-15T01:00:00Z',
    day: '2026-10-15',
    issue: 'GEO-9801',
    added: 10,
    removed: 2,
    excludedFiles: [],
    approximate: false,
    ...over,
  };
}

// What `merged-prs.sh daily <day>` prints for these PRs, as JSON text: GitHub found and sent all of
// them unless `searchCount` says it found more.
export function buildMergedDayOutput(day: string, prs: readonly MergedPR[], searchCount = prs.length): string {
  const issues = [...new Set(prs.flatMap((pr) => (pr.issue === null ? [] : [pr.issue])))].toSorted(),
    repos = [...new Set(prs.map((pr) => pr.repo))].toSorted();
  return JSON.stringify({
    kind: 'daily',
    start: `${day}T00:00:00+11:00`,
    end: `${day}T23:59:59+11:00`,
    searchCount,
    fetched: prs.length,
    totals: { prs: prs.length, issues: issues.length, repos: repos.length, added: countLines(prs, 'added'), removed: countLines(prs, 'removed') },
    byRepo: repos.map((repo) => buildRepoRow(repo, prs)).toSorted((a, b) => b.prs - a.prs),
    byIssue: issues.map((issue) => buildIssueRow(issue, prs)).toSorted((a, b) => b.prs.length - a.prs.length),
    noIssue: prs.filter((pr) => pr.issue === null).map((pr) => ({ repo: pr.repo, number: pr.number, title: pr.title, url: pr.url })),
    prs,
    workflow: [],
  });
}

function buildIssueRow(issue: string, prs: readonly MergedPR[]) {
  const mine = prs.filter((pr) => pr.issue === issue);
  return {
    issue,
    repos: [...new Set(mine.map((pr) => pr.repo))].toSorted(),
    added: countLines(mine, 'added'),
    removed: countLines(mine, 'removed'),
    prs: mine.map((pr) => ({ repo: pr.repo, number: pr.number, url: pr.url })),
  };
}

function buildRepoRow(repo: string, prs: readonly MergedPR[]) {
  const mine = prs.filter((pr) => pr.repo === repo);
  return { repo, prs: mine.length, added: countLines(mine, 'added'), removed: countLines(mine, 'removed') };
}

function countLines(prs: readonly MergedPR[], field: 'added' | 'removed'): number {
  return prs.reduce((total, pr) => total + pr[field], 0);
}
