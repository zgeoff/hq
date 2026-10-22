import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { Runner } from '../runner/types.ts';
import { buildHeadRef } from './build-head-ref.ts';
import { checkCleanMerge } from './check-clean-merge.ts';
import { checkResolutions } from './check-resolutions.ts';
import { collectRewrittenFixes } from './collect-rewritten-fixes.ts';
import { readChainedReviewBase } from './read-chained-review-base.ts';
import { findLastLensHead } from './find-last-lens-head.ts';
import { readRebasedHead } from './read-rebased-head.ts';
import { GitReadError } from './git-read-error.ts';
import { parseJSON } from './parse-json.ts';
import { readCommitSha } from './read-commit-sha.ts';
import { readFixedShas } from './read-fixed-shas.ts';
import type { ListedCommit } from './pick-rebased-head.ts';
import { readIsAncestor } from './read-is-ancestor.ts';

export interface FixesOnlyBasisInput {
  run: Runner;
  db: Database;
  slug: string;
  repo: string;
  pr: number;

  // A checkout of the repo, which the PR head is fetched into.
  dir: string;

  // What an unclean merge of the base counts as. summary (the default): accounted for only when
  // noslop's summary marker lists it as checked. defer: accounted for, because noslop checks its
  // resolution in the run that follows; the caller is a --fixes-only run, before noslop runs.
  merges?: 'defer' | 'summary';
}

// unnamed: a non-merge commit no fixed answer names; unclean-merge: a merge of the base with
// conflict resolutions or hand edits that noslop has not checked; rejected-merge: one whose
// resolution noslop judged not sound; foreign-merge: a merge of a branch other than the base. A
// merge of another PR's commits counts as a merge of the base once that PR merged into the base:
// its own review read that code, and a squash merge leaves those commits out of the base.
// unreviewed: a commit below the base the review read, which neither the base nor a merged PR
// holds (a stack PR retargeted past a lower PR that never merged).
export interface UnreadCommit {
  sha: string;
  kind: 'unnamed' | 'unclean-merge' | 'rejected-merge' | 'foreign-merge' | 'unreviewed';
}

// Whether --fixes-only may stand for a review of the head. none: no ok review ran its lenses;
// unknown: hq cannot list the commits since it; unmapped: a rebase took the reviewed head off the
// branch and no branch commit stands for it, `why` says why; open: each is named by a fixed answer
// or is a clean merge of the base (or, per `merges`, a merge with a checked resolution); shut: `unread` are neither, oldest first.
export type FixesOnlyBasis = { kind: 'none' } | { kind: 'unknown'; since: string | null; why: string } | { kind: 'unmapped'; since: string; why: string } | { kind: 'open'; since: string } | { kind: 'shut'; since: string; unread: UnreadCommit[] };

// The commits to check: after `from` up to the PR's head. `since` is the reviewed head (L) the
// messages name; `from` is L, or the branch commit a rebase made of it (L'); `rebasedOnto` is the
// base ref in the second case, else null.
interface CommitRange {
  since: string;
  from: string;
  to: string;
  rebasedOnto: string | null;
}

// Checks the commits after the last review that ran its lenses (L) up to the PR's head (H). When a
// rebase took L off H's history, L maps to the branch commit with the same patch (L') and the
// commits after L' are checked; a rebase that mapping cannot follow is refused.
export async function checkFixesOnlyBasis(input: FixesOnlyBasisInput): Promise<FixesOnlyBasis> {
  const row = findLastLensHead(input.db, input.repo, input.pr);
  if (row === null) {
    return { kind: 'none' };
  }
  if (row.head === null) {
    return { kind: 'unknown', since: null, why: 'the last review stored no head' };
  }
  return await tryCheckCommitsSince(input, row.head);
}

// Every git read fails closed: one that fails leaves hq unable to tell, never reading a commit as fine.
async function tryCheckCommitsSince(input: FixesOnlyBasisInput, since: string): Promise<FixesOnlyBasis> {
  try {
    return await checkCommitsSince(input, since);
  } catch (error) {
    if (error instanceof GitReadError) {
      return { kind: 'unknown', since, why: error.message };
    }
    throw error;
  }
}

// Only the PR's own line, by first parent: the base commits a merge brings in are the merge's to
// account for, not the PR's.
async function checkCommitsSince(input: FixesOnlyBasisInput, since: string): Promise<FixesOnlyBasis> {
  const fetched = await input.run(['git', 'fetch', '-q', 'origin', `+pull/${input.pr}/head:${buildHeadRef(input.pr)}`], { cwd: input.dir });
  if (fetched.code !== 0) {
    return { kind: 'unknown', since, why: `git cannot list the commits since ${since.slice(0, 7)}: ${(fetched.stderr || fetched.stdout).trim().slice(0, 300)}` };
  }
  return await checkFetched(input, since);
}

async function checkFetched(input: FixesOnlyBasisInput, since: string): Promise<FixesOnlyBasis> {
  const origin = await pickRange(input, since);
  return 'why' in origin ? { kind: origin.kind, since, why: origin.why } : await checkHeldRange(input, origin);
}

// A rebased range already maps only the reviewed commits; a held one still carries what sat below the review's base.
async function checkHeldRange(input: FixesOnlyBasisInput, range: CommitRange): Promise<FixesOnlyBasis> {
  const basis = await checkRange(input, range),
    found = range.rebasedOnto === null ? await readUnreviewedBelow(input, range.since) : [];
  if ('why' in found) {
    return { kind: 'unknown', since: range.since, why: found.why };
  }
  if (found.length === 0 || basis.kind === 'unknown') {
    return basis;
  }
  return { kind: 'shut', since: range.since, unread: [...found, ...(basis.kind === 'shut' ? basis.unread : [])] };
}

async function readHeldBase(input: FixesOnlyBasisInput, reviewBase: string): Promise<string> {
  const found = await input.run(['git', 'merge-base', reviewBase, buildHeadRef(input.pr)], { cwd: input.dir });
  if (found.code !== 0 || found.stdout.trim() === '') {
    throw new GitReadError(`git cannot find where the review's base ${reviewBase.slice(0, 7)} meets the PR's head: ${(found.stderr || found.stdout).trim().slice(0, 300)}`);
  }
  return found.stdout.trim();
}

// The PR's commits below the base the last review read that are not in today's base, by patch or
// by a PR merged into it. That review never read them, so neither does a fixes-only run.
async function readUnreviewedBelow(input: FixesOnlyBasisInput, since: string): Promise<UnreadCommit[] | { why: string }> {
  const reviewBase = await readReviewBase(input, since);
  return reviewBase === null ? [] : await readBelowBase(input, reviewBase);
}

async function readBelowBase(input: FixesOnlyBasisInput, reviewBase: string): Promise<UnreadCommit[] | { why: string }> {
  const base = await readBaseRef(input);
  return typeof base === 'string' ? await readBelowCommits(input, reviewBase, base) : base;
}

async function readBelowCommits(input: FixesOnlyBasisInput, reviewBase: string, base: string): Promise<UnreadCommit[]> {
  const below = await readBelowShas(input, reviewBase, base),
    landed = await Promise.all(below.map((sha) => checkMergedPRCommit(input, sha, base)));
  return below.filter((_sha, index) => landed[index] !== true).map((sha) => ({ sha, kind: 'unreviewed' }));
}

// Only what the head holds: the base a review read is the base branch's tip then, which a lower
// branch that moved on after the fork puts outside the PR's history.
async function readBelowShas(input: FixesOnlyBasisInput, reviewBase: string, base: string): Promise<string[]> {
  const held = await readHeldBase(input, reviewBase),
    listed = await input.run(['git', 'rev-list', '--reverse', '--topo-order', '--right-only', '--cherry-pick', `${base}...${held}`], { cwd: input.dir });
  if (listed.code !== 0) {
    throw new GitReadError(`git cannot list the commits below the review's base ${reviewBase.slice(0, 7)}: ${(listed.stderr || listed.stdout).trim().slice(0, 300)}`);
  }
  return splitShas(listed.stdout);
}

async function checkRange(input: FixesOnlyBasisInput, range: CommitRange): Promise<FixesOnlyBasis> {
  const listed = await input.run(['git', 'rev-list', '--reverse', '--first-parent', `${range.from}..${range.to}`], { cwd: input.dir });
  if (listed.code !== 0) {
    return { kind: 'unknown', since: range.since, why: `git cannot list the commits since ${range.since.slice(0, 7)}: ${(listed.stderr || listed.stdout).trim().slice(0, 300)}` };
  }
  return await checkListedShas(input, range, splitShas(listed.stdout));
}

// L itself when the PR's head holds it; else the branch commit a rebase made of it, by patch id.
async function pickRange(input: FixesOnlyBasisInput, since: string): Promise<CommitRange | { kind: 'unknown' | 'unmapped'; why: string }> {
  const held = await readCommitSha(input.run, input.dir, since);
  if (held === null) {
    return { kind: 'unmapped', why: 'the repo holds no commit of it' };
  }
  return await pickHeldRange(input, since);
}

async function pickHeldRange(input: FixesOnlyBasisInput, since: string): Promise<CommitRange | { kind: 'unknown' | 'unmapped'; why: string }> {
  const isInHead = await readIsAncestor(input.run, input.dir, since, buildHeadRef(input.pr));
  return isInHead ? { since, from: since, to: buildHeadRef(input.pr), rebasedOnto: null } : await pickRebasedRange(input, since);
}

// The rebased flow reads the head across several git calls, so it pins the head's sha first.
async function pickRebasedRange(input: FixesOnlyBasisInput, since: string): Promise<CommitRange | { kind: 'unknown' | 'unmapped'; why: string }> {
  const head = await readPinnedHead(input);
  if (typeof head !== 'string') {
    return { kind: 'unknown', why: head.why };
  }
  return await pickBasedRange(input, since, head);
}

async function pickBasedRange(input: FixesOnlyBasisInput, since: string, head: string): Promise<CommitRange | { kind: 'unknown' | 'unmapped'; why: string }> {
  const base = await readBaseRef(input);
  if (typeof base !== 'string') {
    return { kind: 'unknown', why: base.why };
  }
  return await pickMappedRange(input, { since, base, head });
}

interface RebasedEnds {
  since: string;
  base: string;
  head: string;
}

async function pickMappedRange(input: FixesOnlyBasisInput, ends: RebasedEnds): Promise<CommitRange | { kind: 'unmapped'; why: string }> {
  const based = await readReviewBase(input, ends.since),
    mapped = await readRebasedHead({ run: input.run, dir: input.dir, reviewed: ends.since, base: ends.base, head: ends.head, reviewBase: based });
  return mapped.kind === 'mapped' ? { since: ends.since, from: mapped.head, to: ends.head, rebasedOnto: ends.base } : { kind: 'unmapped', why: mapped.why };
}

async function readReviewBase(input: FixesOnlyBasisInput, since: string): Promise<string | null> {
  const row = findLastLensHead(input.db, input.repo, input.pr);
  return row?.head === since && row.base !== null ? await readCommitSha(input.run, input.dir, readChainedReviewBase(input, row.base)) : null;
}

async function readPinnedHead(input: FixesOnlyBasisInput): Promise<string | { why: string }> {
  const pinned = await input.run(['git', 'rev-parse', '--verify', `${buildHeadRef(input.pr)}^{commit}`], { cwd: input.dir });
  return pinned.code === 0 && pinned.stdout.trim() !== '' ? pinned.stdout.trim() : { why: `git cannot read the PR's head: ${(pinned.stderr || pinned.stdout).trim().slice(0, 300)}` };
}

async function checkListedShas(input: FixesOnlyBasisInput, range: CommitRange, shas: string[]): Promise<FixesOnlyBasis> {
  const commits = await Promise.all(shas.map((sha) => readCommit(input, sha))),
    target = await readBaseTarget(input, commits);
  if (typeof target !== 'string') {
    return { kind: 'unknown', since: range.since, why: target.why };
  }
  return await checkListedCommits(input, range, commits, target);
}

async function readCommit(input: FixesOnlyBasisInput, sha: string): Promise<ListedCommit> {
  const listed = await input.run(['git', 'rev-list', '--parents', '-n', '1', sha], { cwd: input.dir });
  if (listed.code !== 0 || listed.stdout.trim() === '') {
    throw new GitReadError(`git cannot read the parents of ${sha.slice(0, 7)}: ${(listed.stderr || listed.stdout).trim().slice(0, 300)}`);
  }
  return { sha, parents: listed.stdout.trim().split(/\s+/u).slice(1) };
}

const BaseRefSchema = z.object({ baseRefName: z.string().min(1) }),
  PullBaseSchema = z.object({ ref: z.string() }),
  PullItemSchema = z.object({ number: z.number(), merged_at: z.string().nullable(), merge_commit_sha: z.string().nullable(), base: PullBaseSchema }),
  PullListSchema = z.array(PullItemSchema);

// The ref of the PR's base branch that a merge's other parents must be in; empty when the PR's
// line holds no merge, so nothing is read.
async function readBaseTarget(input: FixesOnlyBasisInput, commits: ListedCommit[]): Promise<string | { why: string }> {
  return commits.some((c) => c.parents.length > 1) ? await readBaseRef(input) : '';
}

// The ref of the PR's base branch, fetched fresh.
async function readBaseRef(input: FixesOnlyBasisInput): Promise<string | { why: string }> {
  const answer = await input.run(['gh', 'pr', 'view', String(input.pr), '-R', input.slug, '--json', 'headRefName,baseRefName,body'], { cwd: input.dir }),
    parsed = BaseRefSchema.safeParse(parseJSON(answer.stdout));
  if (answer.code !== 0 || !parsed.success) {
    return { why: `gh cannot give the PR's base branch: ${(answer.stderr || answer.stdout).trim().slice(0, 300)}` };
  }
  return await updateBaseRef(input, parsed.data.baseRefName);
}

// Fetches the base branch, so origin/<base> is the base as GitHub holds it now.
async function updateBaseRef(input: FixesOnlyBasisInput, base: string): Promise<string | { why: string }> {
  const fetched = await input.run(['git', 'fetch', '-q', 'origin', base], { cwd: input.dir });
  if (fetched.code !== 0) {
    return { why: `git cannot fetch the base branch ${base}: ${(fetched.stderr || fetched.stdout).trim().slice(0, 300)}` };
  }
  return `origin/${base}`;
}

// Each non-merge commit must be named by a fixed answer, and each merge must be a clean merge of the base.
async function checkListedCommits(input: FixesOnlyBasisInput, range: CommitRange, commits: ListedCommit[], base: string): Promise<FixesOnlyBasis> {
  const byFix = await collectNamed(input, range, commits),
    checked = await Promise.all(commits.map((c) => checkCommit(input, c, byFix, base))),
    unread = await checkResolutions(input, checked.filter((c) => c !== null));
  return unread.length === 0 ? { kind: 'open', since: range.since } : { kind: 'shut', since: range.since, unread };
}

// The commits a fixed answer names, by prefix; after a rebase, also by the old commit it rewrote.
async function collectNamed(input: FixesOnlyBasisInput, range: CommitRange, commits: ListedCommit[]): Promise<Set<string>> {
  const answers = await readFixedShas(input.run, input.slug, input.pr),
    rewritten = range.rebasedOnto === null ? [] : await collectRewrittenFixes(input.run, input.dir, { since: range.since, base: range.rebasedOnto, answers, commits });
  return new Set([...answers.flatMap((sha) => pickNamedCommit(sha, commits)), ...rewritten]);
}

// Null when the commit is accounted for; else why it is not.
async function checkCommit(input: FixesOnlyBasisInput, commit: ListedCommit, byFix: ReadonlySet<string>, base: string): Promise<UnreadCommit | null> {
  if (commit.parents.length < 2) {
    return byFix.has(commit.sha) ? null : { sha: commit.sha, kind: 'unnamed' };
  }
  if (base === '') {
    return { sha: commit.sha, kind: 'foreign-merge' };
  }
  const ancestry = await Promise.all(commit.parents.slice(1).map((p) => checkInBase(input, p, base))),
    isForeign = ancestry.includes(false),
    isMergeClean = isForeign ? false : await checkCleanMerge(input.run, input.dir, commit.sha);
  if (isForeign) {
    return { sha: commit.sha, kind: 'foreign-merge' };
  }
  return isMergeClean || input.merges === 'defer' ? null : { sha: commit.sha, kind: 'unclean-merge' };
}

async function checkInBase(input: FixesOnlyBasisInput, parent: string, base: string): Promise<boolean> {
  const isAncestor = await readIsAncestor(input.run, input.dir, parent, base);
  return isAncestor ? true : await checkMergedPRCommit(input, parent, base);
}

async function checkMergedPRCommit(input: FixesOnlyBasisInput, sha: string, base: string): Promise<boolean> {
  const found = await readCommitPulls(input, sha),
    kept = found.filter((pr) => pr.number !== input.pr && pr.merged_at !== null && pr.merge_commit_sha !== null && `origin/${pr.base.ref}` === base),
    landed = await Promise.all(kept.map((pr) => readIsAncestor(input.run, input.dir, pr.merge_commit_sha ?? '', base)));
  return landed.includes(true);
}

async function readCommitPulls(input: FixesOnlyBasisInput, sha: string): Promise<z.output<typeof PullListSchema>> {
  const answer = await input.run(['gh', 'api', `repos/${input.slug}/commits/${sha}/pulls`], { cwd: input.dir }),
    parsed = PullListSchema.safeParse(parseJSON(answer.stdout));
  if (answer.code !== 0 || !parsed.success) {
    throw new GitReadError(`gh cannot list the PRs that hold ${sha.slice(0, 7)}: ${(answer.stderr || answer.stdout).trim().slice(0, 300)}`);
  }
  return parsed.data;
}

// The one new commit a fixed sha names by prefix; none when it names none or more than one.
function pickNamedCommit(sha: string, commits: ListedCommit[]): string[] {
  const matches = commits.filter((c) => c.sha.startsWith(sha));
  return matches.length === 1 ? matches.map((c) => c.sha) : [];
}

// `git rev-list` prints one sha a line.
function splitShas(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
