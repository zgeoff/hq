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

export function checkSearchScope(files: readonly SourceFile[]): UnscopedSearch[] {
  return files.flatMap((file) =>
    file.text.split('\n').flatMap((text, index) => (isUnscoped(text) ? [{ path: file.path, line: index + 1, text: text.trim() }] : [])),
  );
}

// The owner's login also authors PRs in other orgs, so a search by author alone returns them.
const QUERY = /\bis:(?:pr|issue)\b|\bauthor:[\w$]/u;
const COMMAND = /\bgh search (?:prs|issues|repos|code|commits)\b.*\s--?\w|'search', '(?:prs|issues|repos|code|commits)'/u;

// An owner such as zgeoff-labs is another org, so the owner name must end where zgeoff ends.
const QUERY_SCOPE = /\b(?:owner|org|user):zgeoff(?![\w-])|\brepo:zgeoff\//u;
const COMMAND_SCOPE = /--owner[ =]zgeoff(?![\w-])|'--owner', 'zgeoff'|--repo[ =]zgeoff\/|'--repo', `zgeoff\//u;

function isUnscoped(text: string): boolean {
  if (QUERY.test(text) && !QUERY_SCOPE.test(text)) {
    return true;
  }
  return COMMAND.test(text) && !COMMAND_SCOPE.test(text);
}

const SKIPPED = /\.test\.\w+$|(?:^|\/)testdata\//u;

export function isScannedPath(path: string): boolean {
  return path !== '' && !SKIPPED.test(path);
}

const PATHS = ['src', 'scripts', 'skills', 'agent-kit'];

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
    .filter((path) => isScannedPath(path))
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }));
}

// Exit 2 on a broken run, so it never reads as exit 1, a check that found an unscoped search.
if (import.meta.main) {
  try {
    const unscoped = checkSearchScope(readSourceFiles());
    for (const search of unscoped) {
      console.log(`${search.path}:${search.line}: a GitHub search with no zgeoff owner: ${search.text}`);
    }
    console.log(`unscoped searches: ${unscoped.length}`);
    const code = unscoped.length === 0 ? 0 : 1;
    process.exit(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(2);
  }
}
