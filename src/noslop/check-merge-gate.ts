import { match } from 'ts-pattern';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import { findAcceptedRisks } from '../pr-status/find-accepted-risks.ts';
import { readHeadLgtm } from '../pr-status/read-head-lgtm.ts';
import { findOwnerOverride } from '../pr-status/find-owner-override.ts';
import { readPRHead } from '../pr-status/read-pr-head.ts';
import { assertPR } from './assert-pr.ts';
import { buildSlug } from './build-slug.ts';
import { checkCIGreen } from './check-ci-green.ts';
import { collectOpenFindingIDs } from './collect-open-finding-ids.ts';
import { checkInstructionHold } from './check-instruction-hold.ts';
import { findInstructionHeldTest } from './find-instruction-held-test.ts';
import { findOwnerHeldTest } from './find-owner-held-test.ts';
import { isBotAuthor } from './is-bot-author.ts';
import type { PRAuthor } from './is-bot-author.ts';
import { isNoslopListed } from './is-noslop-listed.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import { parseLowerRepo } from './parse-lower-repo.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';
import { readGateFacts } from './read-gate-facts.ts';
import type { GateFacts } from './read-gate-facts.ts';
import { readNoslopFindings } from './read-noslop-findings.ts';
import { readOKReviews } from './read-ok-reviews.ts';
import type { OKReviewRecord } from './read-ok-reviews.ts';
import { readPRFiles } from './read-pr-files.ts';
import { pickNoslopVerdict } from './pick-noslop-verdict.ts';
import { pickOwnerHeldVerdict } from './pick-owner-held-verdict.ts';
import { POST_FAILED_PREFIX } from './post-failed-prefix.ts';
import { probeNoCI } from './probe-no-ci.ts';
import type { NoslopGateFacts } from './pick-noslop-verdict.ts';
import { resolveEngine } from './resolve-engine.ts';
import type { PRRequest } from './types.ts';

export interface GateOutcome {
  mayMerge: true;
  reason: string;
  reviewed: boolean;
}

export type OnGateHead = (head: string) => void;

export async function checkMergeGate(request: PRRequest, onHead?: OnGateHead): Promise<GateOutcome> {
  assertPR(request.pr);
  const parsed = parseLowerRepo(request.rawRepo, request.owner),
    facts = await readGateFacts(request.run, buildSlug(parsed), request.pr),
    unreviewed = readUnreviewedRoute(request, parsed, facts.author);
  if (unreviewed === null) {
    onHead?.(facts.headRefOid);
  }
  const noCI = await checkCI(request, parsed, facts);
  await checkOwnerHeld(request, parsed, facts);
  if (unreviewed !== null) {
    return { mayMerge: true, reason: noCI ? `${unreviewed}; the repo runs no CI at ${facts.headRefOid.slice(0, 7)}` : unreviewed, reviewed: false };
  }
  return await checkNoslopGate(request, parsed, facts);
}

async function checkCI(request: PRRequest, parsed: ParsedRepo, facts: GateFacts): Promise<boolean> {
  const verdict = checkCIGreen(facts.statusCheckRollup);
  if (verdict.green) {
    return false;
  }
  if (!('noChecks' in verdict)) {
    throw buildBlock(parsed, request.pr, verdict.reason);
  }
  const headHasNoCI = await probeNoCI(request.run, buildSlug(parsed), facts.headRefOid);
  if (!headHasNoCI) {
    throw buildBlock(parsed, request.pr, verdict.reason);
  }

  // A PR that deletes the workflows of a repo with CI has none at its head, so the base must agree.
  const baseHasNoCI = await probeNoCI(request.run, buildSlug(parsed), facts.baseRefName);
  if (!baseHasNoCI) {
    throw buildBlock(parsed, request.pr, verdict.reason);
  }
  return true;
}

function readUnreviewedRoute(request: PRRequest, parsed: ParsedRepo, author: PRAuthor): string | null {
  if (!isNoslopListed(loadNoslopSettings(request.db), parsed.owner, parsed.repo)) {
    return 'not a noslop repo: green CI is enough';
  }
  if (isBotAuthor(author)) {
    return 'bot PR: green CI is enough';
  }
  return match(resolveEngine(request.db, parsed.owner, parsed.repo, request.pr).engine)
    .with('codex', () => 'on Codex: green CI is enough')
    .with('noslop', () => null)
    .exhaustive();
}

// On every route: a change to an owner-held path needs the owner's own lgtm at the head, and a change
// to a repo instruction file needs it unless hq clears that hold.
async function checkOwnerHeld(request: PRRequest, parsed: ParsedRepo, facts: GateFacts): Promise<void> {
  const ownerHeld = findOwnerHeldTest(parsed);
  const instructionHeld = findInstructionHeldTest(parsed);
  if (ownerHeld === null && instructionHeld === null) {
    return;
  }
  const isHeld = ownerHeld ?? (() => false);
  const isInstruction = instructionHeld ?? (() => false);
  const head = facts.headRefOid;
  const files = await readPRFiles(request.run, buildSlug(parsed), request.pr);
  const lgtm = readHeadLgtm(request.db, parsed.repo, request.pr, head) !== null;
  const instruction = files.filter((file) => isInstruction(file));
  if (ownerHeld === null && instruction.length === 0) {
    return;
  }
  const hold = instruction.length === 0 ? { clear: true, hint: '' } : await checkInstructionHold(request, parsed, { head, author: facts.author, files: instruction, lgtm });
  const headNow = await readPRHead(request.run, buildSlug(parsed), request.pr);
  match(pickOwnerHeldVerdict({ repo: parsed.repo, pr: request.pr, held: files.filter((file) => isHeld(file)), instruction, instructionClear: hold.clear, instructionHint: hold.hint, lgtm, head, headNow }))
    .with({ pass: true }, () => null)
    .with({ pass: false }, (blocked) => {
      throw buildBlock(parsed, request.pr, blocked.reason);
    })
    .exhaustive();
}

function buildBlock(parsed: ParsedRepo, pr: number, reason: string): HqError {
  return new HqError('merge_blocked', reason, { repo: parsed.repo, pr });
}

async function checkNoslopGate(request: PRRequest, parsed: ParsedRepo, facts: GateFacts): Promise<GateOutcome> {
  const noslopFacts = await readNoslopGateFacts(request, parsed, facts.headRefOid);
  return match(pickNoslopVerdict(noslopFacts))
    .with({ pass: true }, (passed): GateOutcome => ({ mayMerge: true, reason: passed.reason, reviewed: true }))
    .with({ pass: false }, (blocked) => {
      throw buildBlock(parsed, request.pr, blocked.reason);
    })
    .exhaustive();
}

async function readNoslopGateFacts(request: PRRequest, parsed: ParsedRepo, head: string): Promise<NoslopGateFacts> {
  const reviews = readOKReviews(request.db, parsed.repo, request.pr);
  const counting = reviews.filter((review) => isCountingReview(review));
  const counted = counting.findLast((review) => !isPostFailed(review)) ?? null;
  const unpostedHead = counted?.head !== head && counting.some((review) => review.head === head && isPostFailed(review)) ? head : null;
  if (counted === null) {
    return { reviewed: false, repo: parsed.repo, pr: request.pr, unpostedHead };
  }
  const known = { repo: parsed.repo, pr: request.pr, head, reviewedHead: counted.head, recorded: countRecordedFindings(reviews), unpostedHead };
  const findings = await readNoslopFindings(request, parsed).then(
    (read) => ({ read: true as const, open: collectOpenFindingIDs(read, findAcceptedRisks(request.db, parsed.repo, request.pr)), listed: read.length }),
    (error: unknown) => ({ read: false as const, error: error instanceof Error ? error.message : String(error) }),
  );
  return await match(findings)
    .with({ read: false }, (failed): NoslopGateFacts => ({ reviewed: true, ...known, findings: failed, override: null, headNow: null }))
    .with({ read: true }, async (found): Promise<NoslopGateFacts> => {
      const headNow = await readPRHead(request.run, buildSlug(parsed), request.pr);
      return { reviewed: true, ...known, findings: found, override: findOwnerOverride(request.db, parsed.repo, request.pr, head), headNow };
    })
    .exhaustive();
}

function isCountingReview(review: OKReviewRecord): boolean {
  return review.confirm === 0 || review.capForced === 1;
}

function isPostFailed(review: OKReviewRecord): boolean {
  return review.error?.startsWith(POST_FAILED_PREFIX) === true;
}

const StoredFindingIDs = z.array(z.object({ id: z.string() }));

function countRecordedFindings(reviews: OKReviewRecord[]): number {
  const ids = reviews.filter((review) => !isPostFailed(review)).flatMap((review) => StoredFindingIDs.parse(JSON.parse(review.findings)).map((finding) => finding.id));
  return new Set(ids).size;
}
