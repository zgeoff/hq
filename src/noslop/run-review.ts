import { toExactOptional } from '@zgeoff/std';
import { mkdirSync } from 'node:fs';
import { match } from 'ts-pattern';
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
import { checkFixesOnlyBasis } from './check-fixes-only-basis.ts';
import { findFetchedHead } from './find-fetched-head.ts';
import { findLastReviewRound } from './find-last-review-round.ts';
import { SHA } from '../runs/sha.ts';
import { writeReviewStarted, writeReviewed } from '../runs/write-review-marks.ts';
import { formatUnmappedHead } from './format-unmapped-head.ts';
import { formatUnreadCommits } from './format-unread-commits.ts';
import { planRoundCap } from './plan-round-cap.ts';
import type { RoundCapPlan } from './plan-round-cap.ts';
import { parseLowerRepo } from './parse-lower-repo.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';
import { readOKReviews } from './read-ok-reviews.ts';
import type { OKReviewRecord } from './read-ok-reviews.ts';
import { requirePinned } from './require-pinned.ts';
import { resolveEngine } from './resolve-engine.ts';
import { resolveNoslopDir } from './resolve-noslop-dir.ts';
import { REVIEW_TIMEOUT_MS, runNoslopReview } from './run-noslop-review.ts';
import type { NoslopReviewContext, NoslopReviewResult } from './run-noslop-review.ts';
import type { PRRequest } from './run-review-check.ts';
import type { FixCheck } from './parse-review-run.ts';
import type { StoredFinding } from './types.ts';

export interface ReviewRequest extends PRRequest {
  watch: boolean;
  effort?: Effort | undefined;

  // Ask noslop for a full review of the PR. Codex PRs refuse it.
  full?: boolean | undefined;

  // The finding whose redesign earns the PR one round past its cap. Codex PRs and --full refuse it.
  redesign?: string | undefined;

  // Check each fix answered since the last round, with no lens: not a round, and allowed past the cap.
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

  // The run was a --fixes-only run, which is not a round.
  fixesOnly: boolean;
  checks: ReviewResult['checks'];
  checksError: string | null;
  openThreads: number | null;

  // --full was asked for, but this is round 2 or later, which reviews only the commits since round 1.
  fullDropped: boolean;

  // The round this review was: the ok reviews before it, plus one. On a --fixes-only run, the rounds so far.
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
  if (request.fixesOnly === true && (request.full === true || request.redesign !== undefined)) {
    throw new HqError('bad_fixes_only', '--fixes-only runs no lens over the diff, so it cannot be given with --full or --redesign');
  }
  if (request.redesign !== undefined && request.full === true) {
    throw new HqError('bad_redesign', '--redesign reviews only the commits since the last round, so it cannot be given with --full');
  }
  return await runNoslopReviewWithCI(request, parsed, requirePinned(picked.sha));
}

function requireNoConfirm(request: ReviewRequest): void {
  if (request.confirm === true) {
    throw new HqError('bad_confirm', '--confirm was removed in 0.62.0: run hq review <repo> <pr> --fixes-only');
  }
}

function requireCodexFlags(request: ReviewRequest, parsed: ParsedRepo): void {
  if (request.redesign !== undefined) {
    throw new HqError('bad_redesign', `--redesign gives a noslop PR one round past its cap, but ${parsed.repo}#${request.pr} is reviewed by Codex, which has no cap`);
  }
  if (request.fixesOnly === true) {
    throw new HqError('bad_fixes_only', `--fixes-only checks a noslop PR's fixes, but ${parsed.repo}#${request.pr} is reviewed by Codex`);
  }
  if (request.full === true) {
    throw new HqError('bad_args', `--full asks noslop for a full review, but ${parsed.repo}#${request.pr} is reviewed by Codex`);
  }
}

// The cap check and the review run under one lock per PR, so two hq review calls on one PR cannot
// both pass the cap: the second waits until the first has recorded its round. It is not the repo
// lock that the git steps take inside, and it outlives the longest noslop run.
async function runNoslopReviewWithCI(request: ReviewRequest, parsed: ParsedRepo, sha: string): Promise<NoslopReviewOutcome> {
  const folder = createScratchDir(),
    ran = await withRepoLock(folder, `${buildSlug(parsed)}-pr${request.pr}`, () => runOpenRound(requireOpenRound(request, parsed), parsed, sha, folder), ROUND_LOCK_STALE_MS),
    state = await readCIState(request.run, buildSlug(parsed), request.pr, request.watch);
  return { ...ran.result, fixChecks: buildTitledFixChecks(ran.result.fixChecks, loadFindingTitles(request, parsed)), fixesOnly: request.fixesOnly === true, checks: state.checks, checksError: state.checksError, openThreads: state.openThreads, fullDropped: ran.open.fullDropped, round: ran.open.round };
}

// The title of each finding the PR's ok reviews stored, by finding id.
function loadFindingTitles(request: ReviewRequest, parsed: ParsedRepo): Map<string, string> {
  return new Map(readOKReviews(request.db, parsed.repo, request.pr).flatMap((r) => (JSON.parse(r.findings) as StoredFinding[]).map((f): [string, string] => [f.id, f.title])));
}

function buildTitledFixChecks(fixChecks: FixCheck[], titles: Map<string, string>): TitledFixCheck[] {
  return fixChecks.map((c) => ({ ...c, title: titles.get(c.findingID) ?? null }));
}

const ROUND_LOCK_STALE_MS = REVIEW_TIMEOUT_MS + 300_000;

interface OpenRound {
  request: ReviewRequest;
  round: number;
  fullDropped: boolean;
}

// The PR's next round, or a refusal when its cap is spent. Round 2 and later review only the
// commits since round 1, so --full is dropped there.
function requireOpenRound(request: ReviewRequest, parsed: ParsedRepo): OpenRound {
  const capPlan = requireRoundLeft(request, parsed),
    dropFull = request.full === true && capPlan.round > 1;
  return { request: { ...request, full: request.full === true && !dropFull }, round: capPlan.round, fullDropped: dropFull };
}

function requireRoundLeft(request: ReviewRequest, parsed: ParsedRepo): RoundCapPlan {
  const okReviews = readOKReviews(request.db, parsed.repo, request.pr).filter((r) => r.confirm === 0),
    plan = planRoundCap(okReviews),
    used = okReviews.find((r) => r.redesign !== null);
  if (request.fixesOnly === true) {
    requireFixesOnlyOpen(plan, `${parsed.repo}#${request.pr}`);
    return { ...plan, round: plan.round - 1 };
  }
  if (request.redesign !== undefined) {
    requireRedesignOpen(request.redesign, used, okReviews, `${parsed.repo}#${request.pr}`);
    requireRedesignPastCap(plan, `${parsed.repo}#${request.pr}`);
  }
  if (plan.cap !== null && plan.round > plan.cap + toExtraRounds(request.redesign)) {
    throw new HqError('round_cap', `${parsed.repo}#${request.pr} had its ${plan.round - 1} noslop round(s) (cap ${plan.cap}: ${plan.reason}). Fix or answer each open finding: a fix after the last round gets no new review. hq review gate ${parsed.repo} ${request.pr} decides the merge. To check fixes pushed after the last round, run hq review ${parsed.repo} ${request.pr} --fixes-only.${formatRedesignHint(used === undefined && plan.round === plan.cap + 1, parsed, request.pr)}`);
  }
  return plan;
}

function requireRedesignOpen(findingID: string, used: OKReviewRecord | undefined, reviews: OKReviewRecord[], ref: string): void {
  if (used !== undefined) {
    throw new HqError('bad_redesign', `${ref} already had its redesign round, for finding ${used.redesign}. A PR gets one.`);
  }
  if (!hasFinding(reviews, findingID)) {
    throw new HqError('bad_redesign', `finding ${findingID} is in no noslop review of ${ref}: --redesign names a finding a review raised.`);
  }
}

// A --fixes-only run checks the fixes answered since a review that ran its lenses, so it needs one.
// It is not a round: it is allowed inside the cap and past it, as often as the PR needs.
function requireFixesOnlyOpen(plan: RoundCapPlan, ref: string): void {
  if (plan.round === 1) {
    throw new HqError('bad_fixes_only', `--fixes-only checks the fixes of an earlier review, but ${ref} has had no noslop review that ran its lenses: run hq review without it.`);
  }
}

// --redesign is the one round past the cap: earlier, it would spend that round inside the cap.
function requireRedesignPastCap(plan: RoundCapPlan, ref: string): void {
  if (plan.cap === null || plan.round !== plan.cap + 1) {
    throw new HqError('bad_redesign', `--redesign is for the round past the cap, but ${ref} is on round ${plan.round} of cap ${plan.cap ?? 'unknown'}: run hq review without it.`);
  }
}

function hasFinding(reviews: OKReviewRecord[], findingID: string): boolean {
  return reviews.some((r) => (JSON.parse(r.findings) as StoredFinding[]).some((f) => f.id === findingID));
}

function toExtraRounds(redesign: string | undefined): number {
  if (redesign === undefined) {
    return 0;
  }
  return 1;
}

function formatRedesignHint(open: boolean, parsed: ParsedRepo, pr: number): string {
  if (!open) {
    return '';
  }
  return ` If a finding forced a redesign of logic patched in 2 rounds, hq review ${parsed.repo} ${pr} --redesign <finding-id> gives one more round.`;
}

interface RanRound {
  result: NoslopReviewResult;
  open: OpenRound;
}

async function runOpenRound(open: OpenRound, parsed: ParsedRepo, sha: string, scratch: string): Promise<RanRound> {
  writeReviewStarted(open.request.db, parsed.repo, open.request.pr);
  const built = await createNoslopContext(open.request, parsed, sha, scratch),
    checked = open.request.fixesOnly === true ? await built.lock(() => requireFixesOnlyHead(built)) : undefined,
    merged = checked === undefined ? built : { ...built, fixesOnlyHead: checked },
    result = await runNoslopReview(merged);
  writeRoundMark(open, parsed, checked ?? null);
  return { result, open };
}

// The head a --fixes-only run was asked to check, else the one the round recorded; only a sha marks
// the run, as a session's `hq run reviewed --sha` must.
function writeRoundMark(open: OpenRound, parsed: ParsedRepo, checked: string | null): void {
  const found = findLastReviewRound(open.request.db, parsed.repo, open.request.pr),
    head = checked ?? found?.head ?? null;
  if (found?.ok === 1 && head !== null && SHA.test(head)) {
    writeReviewed(open.request.db, parsed.repo, open.request.pr, head);
  }
}

// The basis check fetches the PR's head into hq's own ref; the run is asked to check that head.
async function requireFixesOnlyHead(context: NoslopReviewContext): Promise<string | null> {
  await requireFixesOnlyBasis(context);
  return await findFetchedHead(context.run, context.dir, context.pr);
}

// A --fixes-only run moves noslop's check to the PR's head, so it runs only when no lens has
// anything left to read there: each commit since the last review that ran its lenses is named by a
// `fixed <sha>` answer or is a merge of the base. noslop checks a merge's conflict resolution in
// this run, so an unclean merge of the base does not refuse. Refused before noslop runs.
async function requireFixesOnlyBasis(context: NoslopReviewContext): Promise<void> {
  const basis = await checkFixesOnlyBasis({ run: context.run, db: context.db, slug: context.slug, repo: context.repo, pr: context.pr, dir: context.dir, merges: 'defer' });
  match(basis)
    .with({ kind: 'open' }, { kind: 'none' }, () => null)
    .with({ kind: 'shut' }, (b) => {
      throw new HqError('fixes_only_no_fix', formatUnreadCommits(b.since, b.unread, ''), { repo: context.repo, pr: context.pr });
    })
    .with({ kind: 'unmapped' }, (b) => {
      throw new HqError('fixes_only_no_fix', formatUnmappedHead(b.since, b.why, ''), { repo: context.repo, pr: context.pr });
    })
    .with({ kind: 'unknown' }, (b) => {
      throw new HqError('fixes_only_no_fix', `hq cannot tell which commits after the last review no lens has read (${b.why}), so --fixes-only cannot stand for a review of this head.`, { repo: context.repo, pr: context.pr });
    })
    .exhaustive();
}

async function createNoslopContext(request: ReviewRequest, parsed: ParsedRepo, sha: string, scratch: string): Promise<NoslopReviewContext> {
  const dir = await checkout(request.run, buildSlug(parsed), parsed.repo, request.repoDir);
  return {
    run: request.run,
    db: request.db,
    slug: buildSlug(parsed),
    repo: parsed.repo,
    pr: request.pr,
    dir,
    scratch,
    clone: buildRunDir(resolveNoslopDir(), sha),
    sha,
    lock: (fn) => withRepoLock(scratch, buildSlug(parsed), fn),
    full: request.full,
    redesign: request.redesign,
    fixesOnly: request.fixesOnly,
    linear: makeAuditedLinearCaller(request.db, request.run),
  };
}

function createScratchDir(): string {
  const scratch = reviewDir();
  mkdirSync(scratch, { recursive: true });
  return scratch;
}
