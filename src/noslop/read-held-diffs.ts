import { z } from 'zod';
import { checkout } from '../review/checkout.ts';
import type { Runner } from '../runner/types.ts';
import { buildHeadRef } from './build-head-ref.ts';
import { buildRenameKey } from './build-rename-key.ts';
import { collectMovePaths } from './collect-move-paths.ts';
import { GitReadError } from './git-read-error.ts';
import type { HeldDiff, MoveFacts } from './mechanical-types.ts';
import { parseJSON } from './parse-json.ts';
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
  // `git diff -w --ignore-blank-lines` over the held files shows nothing.
  formattingOnly: boolean;
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
  const formatting = await runGit(request, directory, ['diff', '-w', '--ignore-blank-lines', ...DIFF_FLAGS, mergeBase, request.head, '--', ...request.paths]);
  const files: HeldDiff[] = [];
  for (const path of request.paths) {
    const diff = await runGit(request, directory, ['diff', '-M', '--unified=0', ...DIFF_FLAGS, mergeBase, request.head, '--', path]);
    files.push({ path, diff });
  }
  const facts = await readMoveFacts(request, directory, mergeBase, collectMovePaths(files));
  return { formattingOnly: formatting.trim() === '', files, facts };
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
// pathspec magic word must not select another path, or none.
async function runGit(request: HeldDiffRequest, directory: string, args: string[]): Promise<string> {
  const result = await request.run(['git', '--literal-pathspecs', ...args], { cwd: directory });
  return requireOK(result.code, result.stdout, result.stderr, args.join(' '));
}

async function readMoveFacts(request: HeldDiffRequest, directory: string, mergeBase: string, pairs: [string, string][]): Promise<MoveFacts> {
  const facts: MoveFacts = { baseBlobs: new Map(), headBlobs: new Map(), renames: new Set() };
  for (const path of new Set(pairs.flat())) {
    const baseBlob = await readEntry(request, directory, mergeBase, path);
    const headBlob = await readEntry(request, directory, request.head, path);
    facts.baseBlobs.set(path, baseBlob);
    facts.headBlobs.set(path, headBlob);
  }
  for (const [from, to] of pairs) {
    if (facts.baseBlobs.get(from) === null) {
      const log = await runGit(request, directory, ['log', '--no-color', '--diff-filter=R', '-M', '--name-status', '--format=', mergeBase, '--', from, to]);
      for (const line of log.split('\n')) {
        const [status, oldPath, newPath] = line.split('\t');
        if (status?.startsWith('R') === true && oldPath !== undefined && newPath !== undefined) {
          facts.renames.add(buildRenameKey(oldPath, newPath));
        }
      }
    }
  }
  return facts;
}

// The tree entry of `path` at `revision` as git's `<mode> <type> <object>`; null when the path is
// absent there. A directory or a symlink gives its own mode, so it never equals a regular file.
async function readEntry(request: HeldDiffRequest, directory: string, revision: string, path: string): Promise<string | null> {
  const listed = await runGit(request, directory, ['ls-tree', '--full-tree', revision, '--', path]);
  const entries = listed.split('\n').filter((line) => line !== '');
  if (entries.length === 0) {
    return null;
  }
  const [entry = '', listedPath] = entries[0]?.split('\t') ?? [];
  if (entries.length !== 1 || listedPath !== path) {
    throw new GitReadError(`git listed ${entries.length} tree entries for ${path} at ${revision.slice(0, 7)}, not the one path asked for`);
  }
  return entry;
}
