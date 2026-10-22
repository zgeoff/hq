import type { RenderedReport } from '../src/shipped/types.ts';

// A day's report with one kettle group of two rows and one PR with no issue; `over` replaces
// whole fields.
export function buildRenderedReport(over: Partial<RenderedReport> = {}): RenderedReport {
  return {
    kind: 'daily',
    dateLabel: 'Thursday 15 October',
    totals: { prs: 3, repos: 1, issues: 2, added: 120, removed: 30, closed: 1 },
    closed: [{ type: 'Bug', count: 1 }],
    days: null,
    groups: [
      {
        project: 'Kettle Works',
        issues: 2,
        prs: 2,
        burndown: null,
        rows: [
          { issue: 'GEO-9601', title: 'Fit the long spout', url: 'https://linear.example/issue/GEO-9601', state: 'closed', status: 'Done', marker: '🐛', flag: null, prs: [{ repo: 'kettle', number: 41, url: 'https://github.com/zgeoff/kettle/pull/41' }] },
          { issue: 'GEO-9602', title: 'Descale the boiler', url: 'https://linear.example/issue/GEO-9602', state: 'open', status: 'In Review', marker: '✨', flag: '❗', prs: [{ repo: 'kettle', number: 42, url: 'https://github.com/zgeoff/kettle/pull/42' }] },
        ],
      },
    ],
    stillOpen: null,
    noIssue: [{ repo: 'kettle', number: 43, url: 'https://github.com/zgeoff/kettle/pull/43', title: 'tidy the lid notes' }],
    missing: [],
    fetchGap: null,
    ...over,
  };
}
