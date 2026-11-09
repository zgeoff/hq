import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSearchScope, isScannedPath } from './check-search-scope.ts';

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
])('#checkSearchScope passes a scoped search or a line with no search: %s', (text) => {
  expect(checkSearchScope([{ path: 'a.ts', text }])).toStrictEqual([]);
});

test.each([
  ["gh api -X GET search/issues -f q='author:zgeoff is:pr is:open'"],
  ['const query = `is:issue is:open label:bug`;'],
  ['q="author:$login merged:>=$since"'],
  ['q="is:pr owner:zgeoffx"'],
  ['q="is:pr owner:zgeoff-labs"'],
  ['q="is:pr org:zgeoff-work author:zgeoff"'],
  ['gh search prs --author zgeoff --state open'],
  ['gh search prs --owner someone-else --state open'],
  ['gh search prs --owner zgeoff-other --state open'],
  ["run(['gh', 'search', 'prs', '--author', 'zgeoff'])"],
])('#checkSearchScope finds an unscoped search: %s', (text) => {
  expect(checkSearchScope([{ path: 'a.ts', text }])).toStrictEqual([{ path: 'a.ts', line: 1, text }]);
});

test('#checkSearchScope names the file and the 1-based line of each unscoped search', () => {
  const text = 'first line\n  gh search prs --author zgeoff\nlast line';

  expect(checkSearchScope([{ path: 'skills/x/SKILL.md', text }])).toStrictEqual([{ path: 'skills/x/SKILL.md', line: 2, text: 'gh search prs --author zgeoff' }]);
});

test.each([
  ['src/kinds/sync-day.ts', true],
  ['skills/delivery-report/SKILL.md', true],
  ['skills/delivery-report/scripts/merged-prs.sh', true],
  ['src/kinds/sync-day.test.ts', false],
  ['skills/linear-triage/scripts/untracked-prs.test.sh', false],
  ['skills/linear-triage/scripts/testdata/untracked-prs/empty/open.json', false],
  ['testdata/open.json', false],
  ['', false],
])('#isScannedPath reads %s: %p', (path, scanned) => {
  expect(isScannedPath(path)).toBe(scanned);
});

test('it exits 2 when git cannot list the files', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'search-scope-'));
  onTestFinished(() => rmSync(folder, { recursive: true, force: true }));

  const child = Bun.spawn(['bun', join(import.meta.dir, 'check-search-scope.ts')], { cwd: folder, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() } });

  const code = await child.exited;

  expect(code).toBe(2);
});
