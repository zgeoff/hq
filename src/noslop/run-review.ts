import { toExactOptional } from '@zgeoff/std';
import { mkdirSync } from 'node:fs';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import { makeAuditedLinearCaller } from '../linear/make-audited-linear-caller.ts';
import { checkout } from '../review/checkout.ts';
import { readCIState } from '../review/read-ci-state.ts';
import { reviewDir } from '../review/review-dir.ts';
import { review } from '../review/review.ts';
import { withRepoLock } from '../review/with-repo-lock.ts';
import type { Effort, ReviewResult } from '../review/types.ts';
import { assertPR } from './assert-pr.ts';
import { buildRunDir } from './build-run-dir.ts';
import { buildSlug } from './build-slug.ts';
import { findLastReviewRound } from './find-last-review-round.ts';
import { findNoslopCap } from './find-noslop-cap.ts';
import { SHA } from '../runs/sha.ts';
import { writeReviewStarted } from '../runs/write-review-started.ts';
import { writeReviewed } from '../runs/write-reviewed.ts';
import { parseLowerRepo } from './parse-lower-repo.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';
import { readBaseMove } from './read-base-move.ts';
import type { BaseMove } from './pick-base-move.ts';
import { readOKReviews } from './read-ok-reviews.ts';
import { requirePinned } from './require-pinned.ts';
import { resolveEngine } from './resolve-engine.ts';
import { resolveNoslopDefaultStore } from './resolve-noslop-default-store.ts';
import { resolveNoslopDir } from './resolve-noslop-dir.ts';
import { parseReviewTimeout } from './parse-review-timeout.ts';
import { runNoslopReview } from './run-noslop-review.ts';
import type { NoslopReviewContext, NoslopReviewResult } from './run-noslop-review.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import type { PRRequest } from './types.ts';
import type { FixCheck } from './parse-review-run.ts';

export interface ReviewRequest extends PRRequest {
  watch: boolean;
  effort?: Effort | undefined;

  full?: boolean | undefined;

  fixesOnly?: boolean | undefined;

  timeout?: string | undefined;

  confirm?: boolean | undefined;
}

export interface TitledFixCheck extends FixCheck {
  title: string | null;
}

export interface NoslopReviewOutcome extends NoslopReviewResult {
  fixChecks: TitledFixCheck[];

  fixesOnly: boolean;

  emergencyCap: number | null;

  capNote: string | null;

  baseMove: string | null;
  checks: ReviewResult['checks'];
  checksError: string | null;
  openThreads: number | null;

  round: number;
}

export async function runReview(request: ReviewRequest): Promise<ReviewResult | NoslopReviewOutcome> {
  assertPR(request.pr);
  requireNoConfirm(request);
  const parsed = parseLowerRepo(request.rawRepo, request.owner);
  const picked = resolveEngine(request.db, parsed.owner, parsed.repo);
  if (picked.engine === 'codex') {
    requireCodexFlags(request, parsed);
    return await review(request.run, request.rawRepo, request.pr, toExactOptional({ watch: request.watch, owner: request.owner, repoDir: request.repoDir, effort: request.effort }));
  }
  if (request.fixesOnly === true && request.full === true) {
    throw new HqError('bad_fixes_only', '--fixes-only and --full contradict: --fixes-only runs no lens over the diff, and --full asks for a review of the whole PR');
  }
  return await runNoslopReviewWithCI(request, parsed, requirePinned(picked.sha), parseReviewTimeout(request.timeout));
}

function requireNoConfirm(request: ReviewRequest): void {
  if (request.confirm === true) {
    throw new HqError('bad_confirm', '--confirm was removed in 0.62.0: run hq review <repo> <pr> --fixes-only');
  }
}

function requireCodexFlags(request: ReviewRequest, parsed: ParsedRepo): void {
  if (request.fixesOnly === true) {
    throw new HqError('bad_fixes_only', `--fixes-only checks a noslop PR's fixes, but ${parsed.repo}#${request.pr} is reviewed by Codex`);
  }
  if (request.full === true) {
    throw new HqError('bad_args', `--full asks noslop for a full review, but ${parsed.repo}#${request.pr} is reviewed by Codex`);
  }
  if (request.timeout !== undefined) {
    throw new HqError('bad_args', `--timeout limits a noslop run, but ${parsed.repo}#${request.pr} is reviewed by Codex`);
  }
}

const ROUND_LOCK_GRACE_MS = 300_000;

// The cap check and the review run under one lock per PR, so two hq review calls on one PR cannot
// both pass the cap: the second waits until the first has recorded its round. It is not the repo
// lock that the git steps take inside, and it outlives this round's noslop run.
async function runNoslopReviewWithCI(request: ReviewRequest, parsed: ParsedRepo, sha: string, timeoutMs: number): Promise<NoslopReviewOutcome> {
  const folder = createScratchDir();
  const ran = await withRepoLock(
    folder,
    `${buildSlug(parsed)}-pr${request.pr}`,
    async () => {
      const plan = await planBaseMove(planRound(request, parsed, timeoutMs), parsed, folder);
      return await runPlannedRound(plan, parsed, sha, folder);
    },
    timeoutMs + ROUND_LOCK_GRACE_MS,
  );
  const state = await readCIState(request.run, buildSlug(parsed), request.pr, request.watch);
  return { ...ran.result, fixChecks: buildTitledFixChecks(ran.result.fixChecks, loadFindingTitles(request, parsed)), fixesOnly: ran.plan.fixesOnly, emergencyCap: ran.plan.emergencyCap, capNote: formatCapNote(ran.plan.emergencyCap, parsed), baseMove: ran.plan.baseMove?.reviewed ?? null, checks: state.checks, checksError: state.checksError, openThreads: state.openThreads, round: ran.plan.round };
}

function createScratchDir(): string {
  const scratch = reviewDir();
  mkdirSync(scratch, { recursive: true });
  return scratch;
}

async function planBaseMove(plan: RoundPlan, parsed: ParsedRepo, scratch: string): Promise<RoundPlan> {
  if (plan.fixesOnly || plan.request.full === true) {
    return plan;
  }
  const request = plan.request;
  const directory = await checkout(request.run, buildSlug(parsed), parsed.repo, request.repoDir);
  const move = await readBaseMove({ run: request.run, db: request.db, slug: buildSlug(parsed), repo: parsed.repo, pr: request.pr, directory, lock: (fn) => withRepoLock(scratch, buildSlug(parsed), fn) });
  if (move === null) {
    return plan;
  }
  return { ...plan, round: plan.round - 1, fixesOnly: true, baseMove: move };
}

function planRound(request: ReviewRequest, parsed: ParsedRepo, timeoutMs: number): RoundPlan {
  const started = readOKReviews(request.db, parsed.repo, request.pr).filter((okReview) => okReview.confirm === 0).length;
  const cap = findNoslopCap(loadNoslopSettings(request.db), parsed.owner, parsed.repo);
  if (request.fixesOnly === true) {
    return { request, round: started, fixesOnly: true, emergencyCap: null, baseMove: null, timeoutMs };
  }
  if (cap !== null && started >= cap) {
    return { request: { ...request, full: false }, round: started, fixesOnly: true, emergencyCap: cap, baseMove: null, timeoutMs };
  }
  return { request, round: started + 1, fixesOnly: false, emergencyCap: null, baseMove: null, timeoutMs };
}

interface RoundPlan {
  request: ReviewRequest;
  round: number;
  fixesOnly: boolean;
  emergencyCap: number | null;

  baseMove: BaseMove | null;

  timeoutMs: number;
}

interface RanRound {
  result: NoslopReviewResult;
  plan: RoundPlan;
}

async function runPlannedRound(plan: RoundPlan, parsed: ParsedRepo, sha: string, scratch: string): Promise<RanRound> {
  writeReviewStarted(plan.request.db, parsed.repo, plan.request.pr);
  const built = await createNoslopContext(plan, parsed, sha, scratch);
  const result = await runNoslopReview(built);
  writeRoundMark(plan, parsed, result.fixChecks);
  return { result, plan };
}

async function createNoslopContext(plan: RoundPlan, parsed: ParsedRepo, sha: string, scratch: string): Promise<NoslopReviewContext> {
  const request = plan.request;
  const directory = await checkout(request.run, buildSlug(parsed), parsed.repo, request.repoDir);
  return {
    run: request.run,
    db: request.db,
    slug: buildSlug(parsed),
    repo: parsed.repo,
    pr: request.pr,
    // oxlint-disable-next-line zgeoff/no-abbreviated-names -- the property is the review context's own
    dir: directory,
    scratch,
    clone: buildRunDir(resolveNoslopDir(), sha),
    sha,
    store: resolveNoslopDefaultStore(process.env),
    lock: (fn) => withRepoLock(scratch, buildSlug(parsed), fn),
    full: request.full,
    fixesOnly: plan.fixesOnly,
    timeoutMs: plan.timeoutMs,
    baseMove: plan.baseMove ?? undefined,
    linear: makeAuditedLinearCaller(request.db, request.run),
  };
}

// The owner's rules let a fixes-only re-check stand as the review of a fix push.
function writeRoundMark(plan: RoundPlan, parsed: ParsedRepo, fixChecks: readonly FixCheck[]): void {
  if (plan.fixesOnly && plan.emergencyCap === null && plan.baseMove === null && !isRecheckPassed(fixChecks)) {
    return;
  }
  const found = findLastReviewRound(plan.request.db, parsed.repo, plan.request.pr);
  if (plan.baseMove !== null && found?.base_move !== 1) {
    return;
  }
  if (found?.ok === 1 && found.head !== null && SHA.test(found.head)) {
    writeReviewed(plan.request.db, parsed.repo, plan.request.pr, { head: found.head, countsRound: !plan.fixesOnly });
  }
}


function isRecheckPassed(fixChecks: readonly FixCheck[]): boolean {
  return fixChecks.length > 0 && fixChecks.every((check) => check.fixed);
}

function buildTitledFixChecks(fixChecks: FixCheck[], titles: Map<string, string>): TitledFixCheck[] {
  return fixChecks.map((check) => ({ ...check, title: titles.get(check.findingID) ?? null }));
}

const StoredTitles = z.array(z.object({ id: z.string(), title: z.string() }));

function loadFindingTitles(request: ReviewRequest, parsed: ParsedRepo): Map<string, string> {
  const stored = readOKReviews(request.db, parsed.repo, request.pr).flatMap((okReview) => StoredTitles.parse(JSON.parse(okReview.findings)));
  return new Map(stored.map((finding): [string, string] => [finding.id, finding.title]));
}

function formatCapNote(cap: number | null, parsed: ParsedRepo): string | null {
  if (cap === null) {
    return null;
  }
  return `fix checks only: emergency cap ${cap} reached for ${parsed.repo}; no new findings`;
}
