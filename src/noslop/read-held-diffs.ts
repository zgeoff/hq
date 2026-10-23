import { match } from 'ts-pattern';
import { z } from 'zod';
import { checkout } from '../review/checkout.ts';
import type { Runner } from '../runner/types.ts';
import { buildHeadRef } from './build-head-ref.ts';
import { collectMovePaths } from './collect-move-paths.ts';
import { GitReadError } from './git-read-error.ts';
import type { HeldDiff, MoveFacts } from './types.ts';
import { parseJSON } from './parse-json.ts';
import { parseRenameLog } from './parse-rename-log.ts';
import { parseTreeEntry } from './parse-tree-entry.ts';
import { pickHistoryReads } from './pick-history-reads.ts';
import { pickRenames } from './pick-renames.ts';
import { readCommitSha } from './read-commit-sha.ts';

export interface HeldDiffRequest {
  run: Runner;
  slug: string;
  repo: string;
  pr: number;
  head: string;
  paths: string[];
  repoDir?: string | undefined;
}

export interface HeldDiffRead {
  files: HeldDiff[];
  facts: MoveFacts;
}

const DIFF_FLAGS = ['--no-ext-diff', '--no-textconv', '--no-color', '--inter-hunk-context=0'];

// The held files' changes between the merge base and the head, read from hq's checkout of the repo
// at exactly `head`, with what git says about every target a diff claims moved. Throws a
// GitReadError when git cannot give them.
export async function readHeldDiffs(request: HeldDiffRequest): Promise<HeldDiffRead> {
  const directory = await checkout(request.run, request.slug, request.repo, request.repoDir);
  const base = await readBaseRef(request, directory);
  const mergeBaseOutput = await runGit(request, directory, ['merge-base', request.head, base]);
  const mergeBase = mergeBaseOutput.trim();
  const files: HeldDiff[] = [];
  for (const path of request.paths) {
    const diff = await runGit(request, directory, ['diff', '-M', '--unified=0', ...DIFF_FLAGS, mergeBase, request.head, '--', path]);
    files.push({ path, diff });
  }
  const facts = await readMoveFacts(request, directory, mergeBase, collectMovePaths(files));
  return { files, facts };
}

const BaseSchema = z.object({ baseRefName: z.string().min(1) });

// Fetches the PR's head and base into refs of hq's own, checks the head is the one asked for, and
// gives the ref of the base.
async function readBaseRef(request: HeldDiffRequest, directory: string): Promise<string> {
  const view = await request.run(['gh', 'pr', 'view', String(request.pr), '-R', request.slug, '--json', 'baseRefName'], { cwd: directory });
  const parsed = view.code === 0 ? BaseSchema.safeParse(parseJSON(view.stdout)) : null;
  if (parsed?.success !== true) {
    throw new GitReadError(`could not read the base branch of ${request.slug}#${request.pr} from GitHub`);
  }
  const baseRef = `refs/hq/base/${request.pr}`;
  const fetched = await request.run(['git', 'fetch', '-q', 'origin', `+pull/${request.pr}/head:${buildHeadRef(request.pr)}`, `+${parsed.data.baseRefName}:${baseRef}`], { cwd: directory });
  requireOK(fetched.code, fetched.stdout, fetched.stderr, `fetch of ${request.slug}#${request.pr}`);
  const fetchedHead = await readCommitSha(request.run, directory, buildHeadRef(request.pr));
  if (fetchedHead !== request.head) {
    throw new GitReadError(`hq's checkout of ${request.slug} does not hold the PR's head ${request.head.slice(0, 7)}: the head moved`);
  }
  return baseRef;
}

function requireOK(code: number, stdout: string, stderr: string, what: string): string {
  if (code !== 0) {
    throw new GitReadError(`git ${what} failed: ${(stderr || stdout).trim().slice(0, 300)}`);
  }
  return stdout;
}

// A PR's paths reach git as pathspecs, so each is read literally: a held file named with a glob or a
// pathspec magic word must not select another path, or none. Git prints no path quoted.
async function runGit(request: HeldDiffRequest, directory: string, args: string[]): Promise<string> {
  const result = await request.run(['git', '-c', 'core.quotePath=false', '--literal-pathspecs', ...args], { cwd: directory });
  return requireOK(result.code, result.stdout, result.stderr, args.join(' '));
}

async function readMoveFacts(request: HeldDiffRequest, directory: string, mergeBase: string, pairs: [string, string][]): Promise<MoveFacts> {
  const baseBlobs = new Map<string, string | null>();
  const headBlobs = new Map<string, string | null>();
  for (const path of new Set(pairs.flat())) {
    const atBase = await readEntry(request, directory, mergeBase, path);
    const atHead = await readEntry(request, directory, request.head, path);
    baseBlobs.set(path, atBase);
    headBlobs.set(path, atHead);
  }
  const logged: [string, string][] = [];
  for (const [from, to] of pickHistoryReads(pairs, baseBlobs)) {
    const log = await runGit(request, directory, ['log', '-z', '--no-color', '--diff-filter=R', '-M', '--name-status', '--format=', mergeBase, '--', from, to]);
    logged.push(...parseRenameLog(log));
  }
  return { baseBlobs, headBlobs, renames: pickRenames(pairs, baseBlobs, logged) };
}

async function readEntry(request: HeldDiffRequest, directory: string, revision: string, path: string): Promise<string | null> {
  const listed = await runGit(request, directory, ['ls-tree', '-z', '--full-tree', revision, '--', path]);
  return match(parseTreeEntry(listed, path))
    .with({ kind: 'absent' }, () => null)
    .with({ kind: 'entry' }, (found) => found.entry)
    .with({ kind: 'unexpected' }, (found) => {
      throw new GitReadError(`git listed ${found.count} tree entries for ${path} at ${revision.slice(0, 7)}, not the one path asked for`);
    })
    .exhaustive();
}
