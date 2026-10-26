import { match } from 'ts-pattern';
import type { OwnerOverride } from '../pr-status/read-owner-overrides.ts';
import { formatCIClause } from './format-ci-clause.ts';
import type { GateCI } from './format-ci-clause.ts';
import type { BaseMoveCover } from './read-base-move-cover.ts';
import type { NoslopCheck } from './read-noslop-check.ts';
import type { SummaryHead } from './read-summary-head.ts';

type NoslopFindingsRead = { read: true; open: string[]; listed: number } | { read: false; error: string };

export type NoslopGateFacts =
  | { overridden: true; head: string; override: OwnerOverride; findings: NoslopFindingsRead; headNow: string | null }
  | { overridden: false; repo: string; pr: number; head: string; summary: SummaryHead; baseMove: BaseMoveCover | null; check: NoslopCheck; recorded: number; findings: NoslopFindingsRead; headNow: string | null };

export type NoslopVerdict = { pass: true; reason: string } | { pass: false; reason: string };

// `summary` is the head noslop's own last review read, from its summary comment on GitHub; `check` is
// noslop's own check run at the head; `baseMove` says whether a base move lets the review at an older
// summary head stand for this one (null when the heads match); `recorded` counts the distinct findings the PR's reviews recorded in hq.
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
  if (!facts.summary.found) {
    return { pass: false, reason: `${facts.summary.reason}, so no pass: hq review ${facts.repo} ${facts.pr}` };
  }
  if (facts.summary.head !== facts.head && facts.baseMove?.covered !== true) {
    const why = facts.baseMove?.covered === false ? `; not a base move it covers: ${facts.baseMove.why}` : '';
    return { pass: false, reason: `noslop has not reviewed head ${facts.head.slice(0, 7)} (its last review read ${facts.summary.head.slice(0, 7)})${why}; run hq review ${facts.repo} ${facts.pr}` };
  }
  const check = pickCheckBlock(facts, facts.summary.updatedAt);
  if (check !== null) {
    return { pass: false, reason: check };
  }
  return match(facts.findings)
    .with({ read: false }, (failed): NoslopVerdict => ({ pass: false, reason: `could not read noslop's findings, so no pass: ${failed.error}` }))
    .with({ read: true }, (found) => pickFoundVerdict(facts, found, ci))
    .exhaustive();
}

// noslop's check also fails on what its summary head cannot show, such as failed review calls or a
// rejected merge resolution, so the gate takes its conclusion rather than restate its rules.
function pickCheckBlock(facts: Extract<NoslopGateFacts, { overridden: false }>, summaryUpdatedAt: string): string | null {
  const at = facts.head.slice(0, 7);
  if (!facts.check.found) {
    return `${facts.check.reason}, so no pass: hq review ${facts.repo} ${facts.pr}`;
  }
  if (facts.check.status !== 'completed') {
    return `noslop's check at ${at} is ${facts.check.status}, so no pass: wait for it to finish`;
  }
  if (facts.check.completedAt === null || Date.parse(facts.check.completedAt) < Date.parse(summaryUpdatedAt)) {
    return `noslop's check at ${at} predates its latest summary, so it does not judge that review; rerun hq review ${facts.repo} ${facts.pr}`;
  }
  if (facts.check.conclusion !== 'success') {
    return `noslop's check at ${at} is ${facts.check.conclusion ?? 'without a conclusion'}: ${facts.check.title ?? 'no title'}`;
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
  const covers = facts.baseMove?.covered === true ? `noslop's review at ${facts.baseMove.reviewed.slice(0, 7)} covers ${facts.head.slice(0, 7)} (base move, same diff); ` : '';
  return { pass: true, reason: `${covers}noslop findings: none open; ${formatCIClause(facts.head.slice(0, 7), ci)}` };
}
