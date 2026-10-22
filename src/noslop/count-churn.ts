import type { LateCount } from './build-noslop-report.ts';
import type { StoredFinding } from './types.ts';

export interface Churn {
  roundsWithNew: number;
  repeatClass: number;
  classUnknown: number;
  late: LateCount;
  lateUnknown: number;
  mainMerge: number;
  mergeUnknown: number;
}

export interface ChurnReview {
  findings: StoredFinding[];

  // False for a review before the report's window: it only tells which findings and classes came earlier.
  counted: boolean;
}

// The churn of one PR from the findings of its ok reviews, in order. A finding counts once, at the
// review that first raised it. Repeat-class, late and their unknowns look only at findings raised after
// the first review, since the first review has nothing earlier to repeat or be late against.
export function countChurn(reviews: ChurnReview[]): Churn {
  const churn: Churn = { roundsWithNew: 0, repeatClass: 0, classUnknown: 0, late: { n: 0, of: 0 }, lateUnknown: 0, mainMerge: 0, mergeUnknown: 0 },
    cited = new Map<string, Set<string>>(),
    seen = new Set<string>();
  reviews.forEach((review, index) => {
    const findings = review.findings,
      fresh = findings.filter((f, at) => !seen.has(f.id) && findings.findIndex((g) => g.id === f.id) === at);
    if (review.counted) {
      countReview(churn, fresh, index > 0, cited);
    }
    for (const finding of findings) {
      seen.add(finding.id);
      collectCited(cited, finding);
    }
  });
  return churn;
}

function countReview(churn: Churn, fresh: StoredFinding[], later: boolean, cited: Map<string, Set<string>>): void {
  if (fresh.length > 0) {
    churn.roundsWithNew += 1;
  }
  for (const finding of fresh) {
    countFresh(churn, finding, later, cited);
  }
}

function countFresh(churn: Churn, finding: StoredFinding, later: boolean, cited: Map<string, Set<string>>): void {
  if (finding.writtenByChange === false) {
    churn.mainMerge += 1;
  } else if (finding.writtenByChange === undefined || finding.writtenByChange === null) {
    churn.mergeUnknown += 1;
  }
  if (!later) {
    return;
  }
  const key = findClassKey(finding);
  if (key === null && isClassUnread(finding)) {
    churn.classUnknown += 1;
  } else if (key !== null && [...(cited.get(key) ?? [])].some((id) => id !== finding.id)) {
    churn.repeatClass += 1;
  }
  if (finding.late === undefined || finding.late === null) {
    churn.lateUnknown += 1;
    return;
  }
  churn.late.of += 1;
  if (finding.late) {
    churn.late.n += 1;
  }
}

function collectCited(cited: Map<string, Set<string>>, finding: StoredFinding): void {
  const key = findClassKey(finding);
  if (key !== null) {
    cited.set(key, new Set([...(cited.get(key) ?? []), finding.id]));
  }
}

// The class a finding repeats: the taste rule it cites, else none. A lens and criterion is too broad
// to be a class: one criterion such as untested-change holds many unrelated findings.
function findClassKey(finding: StoredFinding): string | null {
  return finding.rule ?? null;
}

// A finding stored before hq kept a criterion: whether it cites a rule is not known.
function isClassUnread(finding: StoredFinding): boolean {
  return finding.criterion === undefined || finding.criterion === null;
}
