import type { RecordedFinding } from './record-round.ts';
import type { StoredFinding } from './types.ts';

// The flat form of a finding that noslop_rounds keeps: absent details are null, so a reader tells "not reported" from a missing key.
export function buildStoredFinding(finding: RecordedFinding): StoredFinding {
  return {
    id: finding.id,
    lens: finding.lens,
    severity: finding.severity,
    title: finding.title,
    criterion: finding.criterion ?? null,
    rule: finding.rule ?? null,
    path: finding.anchor?.path ?? null,
    startLine: finding.anchor?.startLine ?? null,
    endLine: finding.anchor?.endLine ?? null,
    writtenByChange: finding.writtenByChange ?? null,
    late: finding.late ?? null,
  };
}
