import { expect, test } from 'bun:test';
import { checkSearchScope, collectUnscopedSearches } from './check-search-scope.ts';

test.each([
  ["gh api -X GET search/issues -f q='owner:zgeoff author:zgeoff is:pr is:open'"],
  ['const query = `org:zgeoff is:pr is:closed`;'],
  ['fetch "is:pr is:open user:zgeoff author:zgeoff"'],
  ['q="repo:zgeoff/hq is:pr is:open"'],
  ['gh search prs --owner zgeoff --state open --limit 200'],
  ['gh search prs GEO-12 --owner=zgeoff'],
  ["run(['gh', 'search', 'prs', '--owner', 'zgeoff', '--merged'])"],
  ["run(['gh', 'search', 'prs', '--repo', `zgeoff/hq`, '--json', 'number'])"],
  ['`gh search prs` stops at 30 results.'],
  ['throw new Error(`gh search prs for one day failed`);'],
  ['author: z.string().nullable(),'],
])('#collectUnscopedSearches passes a scoped search or a line with no search: %s', (text) => {
  expect(collectUnscopedSearches([{ path: 'a.ts', text }])).toStrictEqual([]);
});

test.each([
  ["gh api -X GET search/issues -f q='author:zgeoff is:pr is:open'"],
  ['const query = `is:issue is:open label:bug`;'],
  ['q="author:$login merged:>=$since"'],
  ['q="is:pr owner:zgeoffx"'],
  ['gh search prs --author zgeoff --state open'],
  ['gh search prs --owner someone-else --state open'],
  ["run(['gh', 'search', 'prs', '--author', 'zgeoff'])"],
])('#collectUnscopedSearches finds an unscoped search: %s', (text) => {
  expect(collectUnscopedSearches([{ path: 'a.ts', text }])).toStrictEqual([{ path: 'a.ts', line: 1, text }]);
});

test('#collectUnscopedSearches names the file and the 1-based line of each unscoped search', () => {
  const text = 'first line\n  gh search prs --author zgeoff\nlast line';

  expect(collectUnscopedSearches([{ path: 'skills/x/SKILL.md', text }])).toStrictEqual([{ path: 'skills/x/SKILL.md', line: 2, text: 'gh search prs --author zgeoff' }]);
});

test('#checkSearchScope returns 0 when every search names the zgeoff owner', () => {
  expect(checkSearchScope([{ path: 'a.ts', text: 'gh search prs --owner zgeoff --state open' }])).toBe(0);
});

test('#checkSearchScope returns 1 when a search has no zgeoff owner', () => {
  expect(checkSearchScope([{ path: 'a.ts', text: 'gh search prs --author zgeoff --state open' }])).toBe(1);
});
