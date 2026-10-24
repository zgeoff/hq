import { match } from 'ts-pattern';
import type { NoslopFinding } from './read-noslop-findings.ts';

// hq trusts the state noslop gives each finding, answer-validity rules included. Its one rule of its
// own: an accepted-risk answer counts only when the owner wrote it.
export function collectOpenFindingIDs(findings: readonly NoslopFinding[], acceptedIDs: ReadonlySet<string>): string[] {
  return findings.filter((finding) => isBlocking(finding, acceptedIDs)).map((finding) => finding.id);
}

function isBlocking(finding: NoslopFinding, acceptedIDs: ReadonlySet<string>): boolean {
  return match(finding.state)
    .with('accepted-risk', () => !acceptedIDs.has(finding.id))
    .with('open', () => true)
    .with('fixed', 'not-a-defect', 'deferred', () => false)
    .exhaustive();
}
