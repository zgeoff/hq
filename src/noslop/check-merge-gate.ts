import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { findAcceptedRisks } from '../pr-status/find-accepted-risks.ts';
import { findOwnerOverride } from '../pr-status/find-owner-override.ts';
import { readPRHead } from '../pr-status/read-pr-head.ts';
import { assertPR } from './assert-pr.ts';
import { buildSlug } from './build-slug.ts';
import { checkCIGreen } from './check-ci-green.ts';
import { collectOpenFindingIDs } from './collect-open-finding-ids.ts';
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
import { pickNoslopVerdict } from './pick-noslop-verdict.ts';
import type { NoslopGateFacts } from './pick-noslop-verdict.ts';
import { resolveEngine } from './resolve-engine.ts';
import type { PRRequest } from './run-review-check.ts';

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
  match(checkCIGreen(facts.statusCheckRollup))
    .with({ green: true }, () => null)
    .with({ green: false }, (red) => {
      throw buildBlock(parsed, request.pr, red.reason);
    })
    .exhaustive();
  if (unreviewed !== null) {
    return { mayMerge: true, reason: unreviewed, reviewed: false };
  }
  return await checkNoslopGate(request, parsed, facts);
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
  if (readOKReviews(request.db, parsed.repo, request.pr).length === 0) {
    return { reviewed: false, repo: parsed.repo, pr: request.pr };
  }
  const findings = await readNoslopFindings(request, parsed).then(
    (read) => ({ read: true as const, open: collectOpenFindingIDs(read, findAcceptedRisks(request.db, parsed.repo, request.pr)) }),
    (error: unknown) => ({ read: false as const, error: error instanceof Error ? error.message : String(error) }),
  );
  return await match(findings)
    .with({ read: false }, (failed): NoslopGateFacts => ({ reviewed: true, head, findings: failed, override: null, headNow: null }))
    .with({ read: true }, async (found): Promise<NoslopGateFacts> => {
      const headNow = await readPRHead(request.run, buildSlug(parsed), request.pr);
      return { reviewed: true, head, findings: found, override: findOwnerOverride(request.db, parsed.repo, request.pr, head), headNow };
    })
    .exhaustive();
}
