import { match } from 'ts-pattern';
import type { OwnerOverride } from '../pr-status/read-owner-overrides.ts';
import { formatCIClause } from './format-ci-clause.ts';
import type { GateCI } from './format-ci-clause.ts';
import type { NoslopCheck } from './read-noslop-check.ts';

type NoslopFindingsRead = { read: true; open: string[]; listed: number } | { read: false; error: string };

export type NoslopGateFacts =
  | { overridden: true; head: string; override: OwnerOverride; findings: NoslopFindingsRead; headNow: string | null }
  | { overridden: false; repo: string; pr: number; head: string; reviewedHead: boolean; check: NoslopCheck; recorded: number; findings: NoslopFindingsRead; headNow: string | null };

export type NoslopVerdict = { pass: true; reason: string } | { pass: false; reason: string };

export function pickNoslopVerdict(facts: NoslopGateFacts, ci: GateCI): NoslopVerdict {
  if (facts.headNow !== facts.head) {
    return { pass: false, reason: `the PR's head moved from ${facts.head.slice(0, 7)} while the gate ran, so no pass: run the gate again` };
  }
  return match(facts)
    .with({ overridden: true }, (overridden) => pickOverriddenVerdict(overridden, ci))
    .with({ overridden: false }, (reviewed) => pickReviewedVerdict(reviewed, ci))
    .exhaustive();
}

function pickOverriddenVerdict(facts: Extract<NoslopGateFacts, { overridden: true }>, ci: GateCI): NoslopVerdict {
  const open = facts.findings.read ? facts.findings.open : [];
  const stands = `The owner's override at ${facts.override.head.slice(0, 7)} (${facts.override.source}) stands`;
  const clause = formatCIClause(facts.head.slice(0, 7), ci);
  if (open.length === 0) {
    return { pass: true, reason: `${stands}; ${clause}` };
  }
  return { pass: true, reason: `${stands} for ${open.length} open finding${open.length === 1 ? '' : 's'}: ${open.join(', ')}; ${clause}` };
}

function pickReviewedVerdict(facts: Extract<NoslopGateFacts, { overridden: false }>, ci: GateCI): NoslopVerdict {
  if (!facts.reviewedHead) {
    return { pass: false, reason: `hq has no noslop run recorded at head ${facts.head.slice(0, 7)}; run hq review ${facts.repo} ${facts.pr}` };
  }
  const check = pickCheckBlock(facts);
  if (check !== null) {
    return { pass: false, reason: check };
  }
  return match(facts.findings)
    .with({ read: false }, (failed): NoslopVerdict => ({ pass: false, reason: `could not read noslop's findings, so no pass: ${failed.error}` }))
    .with({ read: true }, (found) => pickFoundVerdict(facts, found, ci))
    .exhaustive();
}

// The gate needs noslop's check to have finished, not to have passed: a capped PR's check fails at a
// head that only merged main, and the open findings decide the rest.
function pickCheckBlock(facts: Extract<NoslopGateFacts, { overridden: false }>): string | null {
  const at = facts.head.slice(0, 7);
  if (!facts.check.found) {
    return `${facts.check.reason}, so no pass: hq review ${facts.repo} ${facts.pr}`;
  }
  if (facts.check.status !== 'completed') {
    return `noslop's check at ${at} is ${facts.check.status}, so no pass: wait for it to finish`;
  }
  return null;
}

function pickFoundVerdict(facts: Extract<NoslopGateFacts, { overridden: false }>, found: Extract<NoslopFindingsRead, { read: true }>, ci: GateCI): NoslopVerdict {
  if (found.open.length > 0) {
    return { pass: false, reason: `${found.open.length} noslop finding${found.open.length === 1 ? ' is' : 's are'} open: ${found.open.join(', ')}` };
  }
  if (facts.recorded > 0 && found.listed === 0) {
    return { pass: false, reason: `noslop's findings list is empty, but its reviews of this PR recorded ${facts.recorded} finding${facts.recorded === 1 ? '' : 's'}, so no pass` };
  }
  return { pass: true, reason: `noslop findings: none open; ${formatCIClause(facts.head.slice(0, 7), ci)}` };
}
