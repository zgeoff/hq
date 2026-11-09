import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface SourceFile {
  readonly path: string;
  readonly text: string;
}

export interface UnscopedSearch {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

export function checkSearchScope(files: readonly SourceFile[]): number {
  const unscoped = collectUnscopedSearches(files);
  for (const search of unscoped) {
    console.log(`${search.path}:${search.line}: a GitHub search with no zgeoff owner: ${search.text}`);
  }
  console.log(`unscoped searches: ${unscoped.length}`);
  return unscoped.length === 0 ? 0 : 1;
}

// The owner's login also authors PRs in other orgs, so a search by author alone returns them.
const QUERY = /\bis:(?:pr|issue)\b|\bauthor:[\w$]/u;
const COMMAND = /\bgh search (?:prs|issues|repos|code|commits)\b.*\s--?\w|'search', '(?:prs|issues|repos|code|commits)'/u;
const QUERY_SCOPE = /\b(?:owner|org|user):zgeoff\b|\brepo:zgeoff\//u;
const COMMAND_SCOPE = /--owner[ =]zgeoff\b|'--owner', 'zgeoff'|--repo[ =]zgeoff\/|'--repo', `zgeoff\//u;

export function collectUnscopedSearches(files: readonly SourceFile[]): UnscopedSearch[] {
  return files.flatMap((file) =>
    file.text.split('\n').flatMap((text, index) => (isUnscoped(text) ? [{ path: file.path, line: index + 1, text: text.trim() }] : [])),
  );
}

function isUnscoped(text: string): boolean {
  if (QUERY.test(text) && !QUERY_SCOPE.test(text)) {
    return true;
  }
  return COMMAND.test(text) && !COMMAND_SCOPE.test(text);
}

const PATHS = ['src', 'scripts', 'skills', 'agent-kit'];
const SKIPPED = /\.test\.\w+$|\/testdata\//u;

function readSourceFiles(): SourceFile[] {
  const listed = spawnSync('git', ['ls-files', '--', ...PATHS], { encoding: 'utf8' });
  if (listed.error !== undefined) {
    throw listed.error;
  }
  if (listed.status !== 0) {
    throw new Error(`git ls-files exited ${listed.status ?? 'on a signal'}: ${listed.stderr.trim()}`);
  }
  return listed.stdout
    .split('\n')
    .filter((path) => path !== '' && !SKIPPED.test(path))
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }));
}

// Exit 2 on a broken run, so it never reads as exit 1, a check that found an unscoped search.
if (import.meta.main) {
  try {
    process.exit(checkSearchScope(readSourceFiles()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(2);
  }
}
