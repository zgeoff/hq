import type { Runner } from '../runner/types.ts';
import { GitReadError } from './git-read-error.ts';
import { readCommitSha } from './read-commit-sha.ts';
import { readIsAncestor } from './read-is-ancestor.ts';
import { readPatchIDs } from './read-patch-ids.ts';
import type { ListedCommit } from './pick-rebased-head.ts';

// `since` is the reviewed head (L), `base` the base ref the branch was rebased onto, `answers` the
// shas fixed answers name, and `commits` the branch commits after the commit a rebase made of L.
export interface RewrittenFixesInput {
  since: string;
  base: string;
  answers: readonly string[];
  commits: readonly ListedCommit[];
}

// The branch commits that fixed answers name by a commit a rebase rewrote: the answer names a held
// commit after L, or after an earlier rebase of L, whose patch id one listed commit shares. Throws
// GitReadError when git cannot give a patch id or read a commit.
export async function collectRewrittenFixes(run: Runner, dir: string, input: RewrittenFixesInput): Promise<string[]> {
  const resolved = await resolveUnmatched(run, dir, input);
  return await collectSamePatches(run, dir, { resolved, listed: input.commits.filter((c) => c.parents.length < 2).map((c) => c.sha) });
}

interface Candidates {
  resolved: string[];
  listed: string[];
}

async function resolveUnmatched(run: Runner, dir: string, input: RewrittenFixesInput): Promise<string[]> {
  const pending = input.answers.filter((sha) => input.commits.every((c) => !c.sha.startsWith(sha))),
    resolved = await Promise.all(pending.map((sha) => resolveAfterSince(run, dir, { sha, since: input.since, base: input.base })));
  return resolved.filter((sha) => sha !== null);
}

async function collectSamePatches(run: Runner, dir: string, candidates: Candidates): Promise<string[]> {
  const patchIDs = await readPatchIDs(run, dir, pickPatchShas(candidates));
  return candidates.resolved.flatMap((sha) => {
    const id = patchIDs.get(sha),
      same = candidates.listed.filter((listedSha) => id !== undefined && patchIDs.get(listedSha) === id);
    return same.length === 1 ? same : [];
  });
}

function pickPatchShas(candidates: Candidates): string[] {
  return candidates.resolved.length === 0 ? [] : [...candidates.resolved, ...candidates.listed];
}

interface NamedSha {
  sha: string;
  since: string;
  base: string;
}

// Only a commit that came after L, or after a commit an earlier rebase made of L, can be one the
// rebase rewrote; another with the same patch, such as one from another PR's objects, names nothing.
async function resolveAfterSince(run: Runner, dir: string, named: NamedSha): Promise<string | null> {
  const full = await resolveNonMerge(run, dir, named.sha);
  return full === null || full === named.since ? null : await pickAfterSince(run, dir, { ...named, sha: full });
}

async function pickAfterSince(run: Runner, dir: string, named: NamedSha): Promise<string | null> {
  const isAfter = await readIsAncestor(run, dir, named.since, named.sha);
  return isAfter ? named.sha : await pickAfterRewrite(run, dir, named);
}

// Whether a commit before the named one on its own line past the base has L's patch id.
async function pickAfterRewrite(run: Runner, dir: string, named: NamedSha): Promise<string | null> {
  const listed = await run(['git', 'rev-list', '--first-parent', '--no-merges', named.sha, '--not', named.base], { cwd: dir });
  if (listed.code !== 0) {
    throw new GitReadError(`git cannot list the commits before ${named.sha.slice(0, 7)}: ${(listed.stderr || listed.stdout).trim().slice(0, 300)}`);
  }
  return await pickSharedPatch(run, dir, { named, before: splitLines(listed.stdout).filter((sha) => sha !== named.sha) });
}

interface EarlierCommits {
  named: NamedSha;
  before: string[];
}

async function pickSharedPatch(run: Runner, dir: string, earlier: EarlierCommits): Promise<string | null> {
  const forPatch = earlier.before.length === 0 ? [] : [earlier.named.since, ...earlier.before],
    idBySha = await readPatchIDs(run, dir, forPatch),
    reviewedID = idBySha.get(earlier.named.since);
  return reviewedID !== undefined && earlier.before.some((sha) => idBySha.get(sha) === reviewedID) ? earlier.named.sha : null;
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

// The full sha a prefix names when the repo holds that one commit and it is no merge; else null.
async function resolveNonMerge(run: Runner, dir: string, sha: string): Promise<string | null> {
  const full = await readCommitSha(run, dir, sha);
  return full === null ? null : await pickNonMerge(run, dir, full);
}

async function pickNonMerge(run: Runner, dir: string, full: string): Promise<string | null> {
  const listed = await run(['git', 'rev-list', '--parents', '-n', '1', full], { cwd: dir });
  if (listed.code !== 0 || listed.stdout.trim() === '') {
    throw new GitReadError(`git cannot read the parents of ${full.slice(0, 7)}: ${(listed.stderr || listed.stdout).trim().slice(0, 300)}`);
  }
  return listed.stdout.trim().split(/\s+/u).length < 3 ? full : null;
}
