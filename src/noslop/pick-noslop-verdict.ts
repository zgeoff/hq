import { match } from 'ts-pattern';
import type { OwnerOverride } from '../pr-status/read-owner-overrides.ts';
import type { SummaryHead } from './read-summary-head.ts';

type NoslopFindingsRead = { read: true; open: string[]; listed: number } | { read: false; error: string };

export type NoslopGateFacts =
  | { overridden: true; head: string; override: OwnerOverride; findings: NoslopFindingsRead; headNow: string | null }
  | { overridden: false; repo: string; pr: number; head: string; summary: SummaryHead; recorded: number; findings: NoslopFindingsRead; headNow: string | null };

export type NoslopVerdict = { pass: true; reason: string } | { pass: false; reason: string };

// `summary` is the head noslop's own last review read, from its summary comment on GitHub; `recorded`
// counts the distinct findings the PR's reviews recorded in hq.
export function pickNoslopVerdict(facts: NoslopGateFacts): NoslopVerdict {
  if (facts.headNow !== facts.head) {
    return { pass: false, reason: `the PR's head moved from ${facts.head.slice(0, 7)} while the gate ran, so no pass: run the gate again` };
  }
  return match(facts)
    .with({ overridden: true }, (overridden) => pickOverriddenVerdict(overridden))
    .with({ overridden: false }, (reviewed) => pickReviewedVerdict(reviewed))
    .exhaustive();
}

function pickOverriddenVerdict(facts: Extract<NoslopGateFacts, { overridden: true }>): NoslopVerdict {
  const open = facts.findings.read ? facts.findings.open : [];
  const stands = `The owner's override at ${facts.override.head.slice(0, 7)} (${facts.override.source}) stands`;
  if (open.length === 0) {
    return { pass: true, reason: `${stands}; CI green at ${facts.head.slice(0, 7)}` };
  }
  return { pass: true, reason: `${stands} for ${open.length} open finding${open.length === 1 ? '' : 's'}: ${open.join(', ')}` };
}

function pickReviewedVerdict(facts: Extract<NoslopGateFacts, { overridden: false }>): NoslopVerdict {
  if (!facts.summary.found) {
    return { pass: false, reason: `${facts.summary.reason}, so no pass: hq review ${facts.repo} ${facts.pr}` };
  }
  if (facts.summary.head !== facts.head) {
    return { pass: false, reason: `noslop has not reviewed head ${facts.head.slice(0, 7)} (its last review read ${facts.summary.head.slice(0, 7)}); run hq review ${facts.repo} ${facts.pr}` };
  }
  return match(facts.findings)
    .with({ read: false }, (failed): NoslopVerdict => ({ pass: false, reason: `could not read noslop's findings, so no pass: ${failed.error}` }))
    .with({ read: true }, (found) => pickFoundVerdict(facts, found))
    .exhaustive();
}

function pickFoundVerdict(facts: Extract<NoslopGateFacts, { overridden: false }>, found: Extract<NoslopFindingsRead, { read: true }>): NoslopVerdict {
  if (found.open.length > 0) {
    return { pass: false, reason: `${found.open.length} noslop finding${found.open.length === 1 ? ' is' : 's are'} open: ${found.open.join(', ')}` };
  }
  if (facts.recorded > 0 && found.listed === 0) {
    return { pass: false, reason: `noslop's findings list is empty, but its reviews of this PR recorded ${facts.recorded} finding${facts.recorded === 1 ? '' : 's'}, so no pass` };
  }
  return { pass: true, reason: `noslop findings: none open; CI green at ${facts.head.slice(0, 7)}` };
}
