import type { Database } from 'bun:sqlite';
import { recordOpRead } from '../one-password/record-op-read.ts';
import { rmSync } from 'node:fs';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import type { LinearCall } from '../linear/types.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { buildFailure } from './build-failure.ts';
import { buildIssueArgs } from './build-issue-args.ts';
import { buildRoundStem } from './build-round-stem.ts';
import { buildNoslopCommand } from './build-noslop-command.ts';
import { buildNoslopEnv } from './build-noslop-env.ts';
import { collectLateFlags } from './collect-late-flags.ts';
import { createIssueFile } from './create-issue-file.ts';
import type { IssueFile, IssueNote } from './create-issue-file.ts';
import { getTail } from './get-tail.ts';
import { loadNoslopSecrets } from './load-noslop-secrets.ts';
import type { NoslopSecrets } from './load-noslop-secrets.ts';
import { parseReviewRun } from './parse-review-run.ts';
import type { FixCheck, NotReviewedFile, ReviewFinding, ReviewOutput } from './parse-review-run.ts';
import { pickAction } from './pick-action.ts';
import { probeStoredReview } from './probe-stored-review.ts';
import type { BaseMove } from './read-base-move.ts';
import { readPRPatchID } from './read-pr-patch-id.ts';
import { recordRound } from './record-round.ts';
import type { RecordedFinding, RoundRow } from './record-round.ts';
import { removeIssueFile } from './remove-issue-file.ts';
import { requireOK } from './require-ok.ts';
import type { Judged } from './types.ts';
import { REVIEW_TIMEOUT_MS } from './review-timeout-ms.ts';

export interface NoslopReviewContext {
  run: Runner;
  db: Database;
  slug: string;
  repo: string;
  pr: number;

  // The checkout of the repo that the worktree is made from.
  dir: string;

  // The review folder: the worktree and the output file live here.
  scratch: string;

  // Hq's pinned clone of noslop, and the commit it is pinned to.
  clone: string;
  sha: string;

  // The store noslop writes each review to before it posts the review to GitHub.
  store: string;

  // Runs a function under the repo's lock.
  lock: <T>(fn: () => Promise<T>) => Promise<T>;

  // Review the whole PR, not only the commits since the last round.
  full?: boolean | undefined;

  // Fix checks only (`noslop review --fixes-only`), recorded as a review that is not a round.
  fixesOnly?: boolean | undefined;

  // The head and PR diff a base move was found at. The run is recorded as a base move only when
  // noslop ran on that head and the diff is still that one: a push in between makes it a plain fix check.
  baseMove?: Pick<BaseMove, 'head' | 'patchId'> | undefined;

  // Reads the Linear issue the PR links, for noslop's intent lens. Without it no issue is attached.
  linear?: LinearCall | undefined;
}

export interface NoslopReviewResult {
  engine: 'noslop';
  repo: string;
  pr: number;
  head: string;
  base: string;
  reviewFile: string;
  depth: string | null;
  findings: ReviewFinding[];

  // The changed files no noslop call read; z-review checks them by hand.
  notReviewed: NotReviewedFile[];

  // Noslop's verdict on each fix a --fixes-only run checked; empty on any other run.
  fixChecks: FixCheck[];
  ms: number;
  sha: string;
  issue: IssueNote;

  // Why noslop failed after it stored the review, when the post to GitHub is all that is left; null
  // when noslop posted the review.
  postFailed: string | null;
}

// A noslop review of the PR head, run in a throwaway worktree of the base. Any failure before noslop
// stored the review is recorded with ok = 0 and thrown as noslop_failed; it never falls back to
// another reviewer.
export async function runNoslopReview(ctx: NoslopReviewContext): Promise<NoslopReviewResult> {
  const prep = await createReviewPrep(ctx),
    ran = await runNoslopProcess(ctx, prep),
    row = await collectReviewRow(ctx, ran);
  recordRound(ctx.db, row);
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- grandfathered key of the review event
  logEvent(ctx.db, 'hq', `noslop:${ctx.repo}#${ctx.pr}`, pickAction('review', row.ok), 'hq', null, null, { ms: ran.ms, findings: row.findings.length, sha: ran.sha, issue: prep.issueFile.note, postFailed: ran.postFailed });
  if (ran.cleanupError !== null) {
    logEvent(ctx.db, 'hq', `noslop:${ctx.repo}#${ctx.pr}`, 'cleanup_failed', 'hq', null, null, { worktree: prep.worktree, error: ran.cleanupError });
  }
  if (ran.judged.value === null) {
    throw buildFailure(ran.judged.why ?? 'unknown', prep.reviewFile);
  }
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- grandfathered property of the review result
  return { engine: 'noslop', repo: ctx.repo, pr: ctx.pr, head: prep.refs.headRefName, base: prep.refs.baseRefName, reviewFile: prep.reviewFile, depth: ran.judged.value.depth, findings: ran.judged.value.findings, notReviewed: ran.judged.value.notReviewed, fixChecks: ran.judged.value.fixChecks, ms: ran.ms, sha: ran.sha, issue: prep.issueFile.note, postFailed: ran.postFailed };
}

interface PRRefs {
  headRefName: string;
  baseRefName: string;
  body?: string | undefined;
}

interface ReviewPrep {
  secrets: NoslopSecrets;
  refs: PRRefs;
  worktree: string;
  reviewFile: string;
  issueFile: IssueFile;
}

// Credentials first, so a missing one stops the review before any worktree exists. The worktree name
// is unique per process: a second review of the same PR never removes this one's worktree.
async function createReviewPrep(ctx: NoslopReviewContext): Promise<ReviewPrep> {
  const refs = await readPRRefs(ctx),
    reviewFile = `${ctx.scratch}/${buildRoundStem(ctx.repo, ctx.pr)}-noslop.json`,
    secrets = await loadNoslopSecrets(ctx.run, () => recordOpRead(ctx.db, 'noslop', 1)),
    worktree = `${ctx.scratch}/${buildRoundStem(ctx.repo, ctx.pr)}-noslop-${process.pid}`;
  rmSync(worktree, { recursive: true, force: true });
  rmSync(reviewFile, { force: true });
  await createWorktree(ctx, worktree, refs.baseRefName);
  return { secrets, refs, worktree, reviewFile, issueFile: await createReviewIssueFile(ctx, refs, worktree) };
}

async function readPRRefs(ctx: NoslopReviewContext): Promise<PRRefs> {
  const raw = await requireOK(ctx.run, ['gh', 'pr', 'view', String(ctx.pr), '-R', ctx.slug, '--json', 'headRefName,baseRefName,body'], ctx.dir);
  return JSON.parse(raw) as PRRefs;
}

async function createWorktree(ctx: NoslopReviewContext, worktree: string, base: string): Promise<void> {
  await ctx.lock(async () => {
    await requireOK(ctx.run, ['git', 'fetch', '-q', 'origin'], ctx.dir);
    await requireOK(ctx.run, ['git', 'fetch', '-q', 'origin', `pull/${ctx.pr}/head`], ctx.dir);
    await ctx.run(['git', 'worktree', 'prune'], { cwd: ctx.dir });
    await requireOK(ctx.run, ['git', 'worktree', 'add', '-q', '--detach', worktree, `origin/${base}`], ctx.dir);
  });
}

async function createReviewIssueFile(ctx: NoslopReviewContext, refs: PRRefs, worktree: string): Promise<IssueFile> {
  if (ctx.fixesOnly === true) {
    return { path: null, note: { issue: null, attached: false, why: 'a fixes-only run reads no issue' } };
  }
  if (ctx.linear === undefined) {
    return { path: null, note: { issue: null, attached: false, why: 'no Linear reader' } };
  }
  return await createIssueFile({ run: ctx.run, linear: ctx.linear, clone: ctx.clone, cwd: worktree, body: refs.body ?? '', path: `${ctx.scratch}/${buildRoundStem(ctx.repo, ctx.pr)}-issue-${process.pid}.md` });
}

interface ReviewRan {
  judged: Judged<ReviewOutput>;
  postFailed: string | null;
  ms: number;
  startedAt: string;
  sha: string;
  cleanupError: string | null;
}

// Runs `noslop review` in the worktree and removes the worktree after, whatever happened. A review
// that ran keeps its result when the removal fails, so its round is still recorded.
async function runNoslopProcess(ctx: NoslopReviewContext, prep: ReviewPrep): Promise<ReviewRan> {
  try {
    const ran = await runNoslopLocked(ctx, prep);
    return { ...ran, cleanupError: await removeWorktree(ctx, prep.worktree) };
  } catch (error) {
    await removeWorktree(ctx, prep.worktree);
    throw error;
  } finally {
    if (prep.issueFile.path !== null) {
      removeIssueFile(prep.issueFile.path);
    }
  }
}

async function runNoslopLocked(ctx: NoslopReviewContext, prep: ReviewPrep): Promise<Omit<ReviewRan, 'cleanupError'>> {
  const args = buildReviewArgs(ctx, prep),
    began = Date.now(),
    begun = iso(now()),
    command = buildNoslopCommand(ctx.clone, args),
    proc = await boundedRunner(ctx.run, REVIEW_TIMEOUT_MS)(command, { cwd: prep.worktree, env: buildNoslopEnv(prep.secrets) }),
    verdict = parseReviewRun(proc.code, proc.stdout, getTail(proc.stderr, prep.secrets), REVIEW_TIMEOUT_MS);
  await Bun.write(prep.reviewFile, proc.stdout);
  // oxlint-disable-next-line zgeoff/no-abbreviated-names -- grandfathered property of the recorded round
  return { ...readPostFailedReview(ctx.store, proc.stdout, verdict), ms: Date.now() - began, startedAt: begun, sha: ctx.sha };
}

// noslop prints the review, then writes it to its store, then posts it to GitHub. A run that failed
// with the printed review in its store failed only the post: the review is a round all the same.
function readPostFailedReview(store: string, stdout: string, verdict: Judged<ReviewOutput>): Pick<ReviewRan, 'judged' | 'postFailed'> {
  if (verdict.value !== null) {
    return { judged: verdict, postFailed: null };
  }
  const printed = parseReviewRun(0, stdout, '', REVIEW_TIMEOUT_MS);
  if (printed.value === null || !probeStoredReview(store, stdout)) {
    return { judged: verdict, postFailed: null };
  }
  return { judged: printed, postFailed: verdict.why ?? 'unknown' };
}

function buildReviewArgs(ctx: NoslopReviewContext, prep: ReviewPrep): string[] {
  const fixesOnly = ctx.fixesOnly === true ? ['--fixes-only'] : [],
    full = ctx.full === true ? ['--full'] : [],
    issue = buildIssueArgs(prep.issueFile);
  return ['review', '--pr', String(ctx.pr), '--repo', ctx.slug, '--report', 'sqlite,github', '--json', ...full, ...fixesOnly, ...issue];
}

async function removeWorktree(ctx: NoslopReviewContext, worktree: string): Promise<string | null> {
  try {
    await ctx.lock(() => ctx.run(['git', 'worktree', 'remove', '--force', worktree], { cwd: ctx.dir }));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// Never fails the review: a git or database fault leaves every finding's late flag null.
async function findLate(ctx: NoslopReviewContext, ran: ReviewRan): Promise<Map<string, boolean | null>> {
  if (ran.judged.value === null) {
    return new Map();
  }
  try {
    return await collectLateFlags({ run: ctx.run, db: ctx.db, repo: ctx.repo, pr: ctx.pr, dir: ctx.dir, head: ran.judged.value.head, findings: ran.judged.value.findings });
  } catch {
    return new Map();
  }
}

// Never fails the review: a git fault leaves the round's patch-id null.
async function readRoundPatchID(ctx: NoslopReviewContext, ran: ReviewRan): Promise<string | null> {
  const output = ran.judged.value;
  if (output === null || output.base === null || output.head === null) {
    return null;
  }
  try {
    return await readPRPatchID(ctx.run, ctx.dir, output.base, output.head);
  } catch {
    return null;
  }
}

async function collectReviewRow(ctx: NoslopReviewContext, ran: ReviewRan): Promise<RoundRow> {
  const late = await findLate(ctx, ran);
  const patchId = await readRoundPatchID(ctx, ran);
  return {
    repo: ctx.repo,
    pr: ctx.pr,
    kind: 'review',
    startedAt: ran.startedAt,
    endedAt: iso(now()),
    ms: ran.ms,
    ok: ran.judged.value !== null,
    head: ran.judged.value?.head ?? null,
    base: ran.judged.value?.base ?? null,
    depth: ran.judged.value?.depth ?? null,
    special: buildSpecial(ran.judged.value),
    findings: (ran.judged.value?.findings ?? []).map((f) => buildRecordedFinding(f, late.get(f.id) ?? null)),
    failedCalls: ran.judged.failedCalls,
    conclusion: null,
    open: [],
    error: ran.postFailed === null ? ran.judged.why : `stored, but not posted to GitHub: ${ran.postFailed}`,
    sha: ran.sha,
    full: ctx.full === true,
    confirm: ctx.fixesOnly === true,
    patchId,
    baseMove: ctx.baseMove !== undefined && ran.judged.value?.head === ctx.baseMove.head && patchId === ctx.baseMove.patchId,
  };
}

function buildRecordedFinding(finding: ReviewFinding, late: boolean | null): RecordedFinding {
  return { ...finding, late };
}

function buildSpecial(output: ReviewOutput | null): string | null {
  if (output === null) {
    return null;
  }
  return output.special ?? 'none';
}
