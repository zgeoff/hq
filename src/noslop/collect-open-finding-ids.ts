import { match } from 'ts-pattern';
import type { NoslopFinding } from './read-noslop-findings.ts';

// noslop's list does not show whether a deferral is valid, so a deferred finding counts as open.
export function collectOpenFindingIDs(findings: readonly NoslopFinding[], acceptedIDs: ReadonlySet<string>): string[] {
  return findings.filter((finding) => isBlocking(finding, acceptedIDs)).map((finding) => finding.id);
}

function isBlocking(finding: NoslopFinding, acceptedIDs: ReadonlySet<string>): boolean {
  return match(finding.state)
    .with('accepted-risk', () => !acceptedIDs.has(finding.id))
    .with('open', 'deferred', () => true)
    .with('fixed', 'not-a-defect', () => false)
    .exhaustive();
}
