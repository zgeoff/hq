import { match } from 'ts-pattern';
import type { OwnerOverride } from '../pr-status/find-owner-override.ts';

type NoslopFindingsRead = { read: true; open: string[] } | { read: false; error: string };

export type NoslopGateFacts =
  | { reviewed: false; repo: string; pr: number }
  | { reviewed: true; head: string; findings: NoslopFindingsRead; override: OwnerOverride | null; headNow: string | null };

export type NoslopVerdict = { pass: true; reason: string } | { pass: false; reason: string };

export function pickNoslopVerdict(facts: NoslopGateFacts): NoslopVerdict {
  return match(facts)
    .with({ reviewed: false }, (unreviewed) => ({ pass: false as const, reason: `noslop has no completed review of this PR, so no pass: hq review ${unreviewed.repo} ${unreviewed.pr}` }))
    .with({ reviewed: true }, (reviewed) =>
      match(reviewed.findings)
        .with({ read: false }, (failed) => ({ pass: false as const, reason: `could not read noslop's findings, so no pass: ${failed.error}` }))
        .with({ read: true }, (found) => pickReadVerdict(reviewed, found.open))
        .exhaustive(),
    )
    .exhaustive();
}

type ReviewedFacts = Extract<NoslopGateFacts, { reviewed: true }>;

function pickReadVerdict(facts: ReviewedFacts, open: string[]): NoslopVerdict {
  if (open.length > 0 && facts.override === null) {
    return { pass: false, reason: `${open.length} noslop finding${open.length === 1 ? ' is' : 's are'} open: ${open.join(', ')}` };
  }
  if (facts.headNow !== facts.head) {
    return { pass: false, reason: `the PR's head moved from ${facts.head.slice(0, 7)} while the gate ran, so no pass: run the gate again` };
  }
  if (open.length > 0 && facts.override !== null) {
    return { pass: true, reason: `The owner's override at ${facts.override.head.slice(0, 7)} (${facts.override.source}) stands for ${open.length} open finding${open.length === 1 ? '' : 's'}: ${open.join(', ')}` };
  }
  return { pass: true, reason: `noslop findings: none open; CI green at ${facts.head.slice(0, 7)}` };
}
