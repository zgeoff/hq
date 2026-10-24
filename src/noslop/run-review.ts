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
import { readOKReviews } from './read-ok-reviews.ts';
import { requirePinned } from './require-pinned.ts';
import { resolveEngine } from './resolve-engine.ts';
import { resolveNoslopDefaultStore } from './resolve-noslop-default-store.ts';
import { resolveNoslopDir } from './resolve-noslop-dir.ts';
import { REVIEW_TIMEOUT_MS } from './review-timeout-ms.ts';
import { runNoslopReview } from './run-noslop-review.ts';
import type { NoslopReviewContext, NoslopReviewResult } from './run-noslop-review.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import type { PRRequest } from './types.ts';
import type { FixCheck } from './parse-review-run.ts';

export interface ReviewRequest extends PRRequest {
  watch: boolean;
  effort?: Effort | undefined;

  // Ask noslop for a full review of the PR. Codex PRs refuse it.
  full?: boolean | undefined;

  // A plain pass-through to `noslop review --fixes-only`: no basis check, no refusal, not a round, no reviewed mark.
  fixesOnly?: boolean | undefined;

  // The removed --confirm flag: still read, only so that it is refused with a pointer.
  confirm?: boolean | undefined;
}

export interface TitledFixCheck extends FixCheck {
  // The finding's title when hq stored the finding; null otherwise.
  title: string | null;
}

export interface NoslopReviewOutcome extends NoslopReviewResult {
  fixChecks: TitledFixCheck[];

  // The run was a fix-checks-only run (--fixes-only, or past the emergency cap), which is not a round.
  fixesOnly: boolean;

  // The emergency review cap that turned this review into fix checks only; null when it did not.
  emergencyCap: number | null;

  // One line that says so when the cap did; null otherwise.
  capNote: string | null;
  checks: ReviewResult['checks'];
  checksError: string | null;
  openThreads: number | null;

  // The round this review was: the full reviews hq ran before it, plus one. On a fix-checks-only run, the reviews so far.
  round: number;
}

// Runs the review the PR's engine gives it. A noslop PR gets noslop and its CI and thread counts;
// any other gets the Codex review as before.
export async function runReview(request: ReviewRequest): Promise<ReviewResult | NoslopReviewOutcome> {
  assertPR(request.pr);
  requireNoConfirm(request);
  const parsed = parseLowerRepo(request.rawRepo, request.owner),
    picked = resolveEngine(request.db, parsed.owner, parsed.repo, request.pr);
  if (picked.engine === 'codex') {
    requireCodexFlags(request, parsed);
    return await review(request.run, request.rawRepo, request.pr, toExactOptional({ watch: request.watch, owner: request.owner, repoDir: request.repoDir, effort: request.effort }));
  }
  if (request.fixesOnly === true && request.full === true) {
    throw new HqError('bad_fixes_only', '--fixes-only and --full contradict: --fixes-only runs no lens over the diff, and --full asks for a review of the whole PR');
  }
  return await runNoslopReviewWithCI(request, parsed, requirePinned(picked.sha));
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
}

const ROUND_LOCK_STALE_MS = REVIEW_TIMEOUT_MS + 300_000;

// The cap check and the review run under one lock per PR, so two hq review calls on one PR cannot
// both pass the cap: the second waits until the first has recorded its round. It is not the repo
// lock that the git steps take inside, and it outlives the longest noslop run.
async function runNoslopReviewWithCI(request: ReviewRequest, parsed: ParsedRepo, sha: string): Promise<NoslopReviewOutcome> {
  const folder = createScratchDir();
  const ran = await withRepoLock(folder, `${buildSlug(parsed)}-pr${request.pr}`, () => runPlannedRound(planRound(request, parsed), parsed, sha, folder), ROUND_LOCK_STALE_MS);
  const state = await readCIState(request.run, buildSlug(parsed), request.pr, request.watch);
  return { ...ran.result, fixChecks: buildTitledFixChecks(ran.result.fixChecks, loadFindingTitles(request, parsed)), fixesOnly: ran.plan.fixesOnly, emergencyCap: ran.plan.emergencyCap, capNote: formatCapNote(ran.plan.emergencyCap, parsed), checks: state.checks, checksError: state.checksError, openThreads: state.openThreads, round: ran.plan.round };
}

function createScratchDir(): string {
  const scratch = reviewDir();
  mkdirSync(scratch, { recursive: true });
  return scratch;
}

interface RoundPlan {
  request: ReviewRequest;
  round: number;
  fixesOnly: boolean;
  emergencyCap: number | null;
}

interface RanRound {
  result: NoslopReviewResult;
  plan: RoundPlan;
}

async function runPlannedRound(plan: RoundPlan, parsed: ParsedRepo, sha: string, scratch: string): Promise<RanRound> {
  writeReviewStarted(plan.request.db, parsed.repo, plan.request.pr);
  const built = await createNoslopContext(plan, parsed, sha, scratch);
  const result = await runNoslopReview(built);
  writeRoundMark(plan, parsed);
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
    linear: makeAuditedLinearCaller(request.db, request.run),
  };
}

// A full review, or a fix-checks-only run the emergency cap forced, marks the head it ran on so the
// sweep stops calling the head unreviewed; a hand-run --fixes-only marks nothing. Only a full review
// counts as a round.
function writeRoundMark(plan: RoundPlan, parsed: ParsedRepo): void {
  if (plan.fixesOnly && plan.emergencyCap === null) {
    return;
  }
  const found = findLastReviewRound(plan.request.db, parsed.repo, plan.request.pr);
  if (found?.ok === 1 && found.head !== null && SHA.test(found.head)) {
    writeReviewed(plan.request.db, parsed.repo, plan.request.pr, { head: found.head, countsRound: !plan.fixesOnly });
  }
}

// A full review, unless the caller asked for fix checks only or the repo's emergency cap is spent:
// past the cap, the review runs fix checks only and raises no new finding.
function planRound(request: ReviewRequest, parsed: ParsedRepo): RoundPlan {
  const started = readOKReviews(request.db, parsed.repo, request.pr).filter((okReview) => okReview.confirm === 0).length;
  const cap = findNoslopCap(loadNoslopSettings(request.db), parsed.owner, parsed.repo);
  if (request.fixesOnly === true) {
    return { request, round: started, fixesOnly: true, emergencyCap: null };
  }
  if (cap !== null && started >= cap) {
    return { request: { ...request, full: false }, round: started, fixesOnly: true, emergencyCap: cap };
  }
  return { request, round: started + 1, fixesOnly: false, emergencyCap: null };
}

function buildTitledFixChecks(fixChecks: FixCheck[], titles: Map<string, string>): TitledFixCheck[] {
  return fixChecks.map((check) => ({ ...check, title: titles.get(check.findingID) ?? null }));
}

const StoredTitles = z.array(z.object({ id: z.string(), title: z.string() }));

// The title of each finding the PR's ok reviews stored, by finding id.
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
