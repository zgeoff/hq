import type { LateCount, PRReport } from './build-noslop-report.ts';

export interface NoslopTotals {
  prs: number;
  roundsWithNew: number;
  repeatClass: number;
  classUnknown: number;
  late: LateCount;
  lateUnknown: number;
  mainMerge: number;
  mergeUnknown: number;
}

// The churn figures summed across PRs.
export function buildNoslopTotals(reports: PRReport[]): NoslopTotals {
  const buildSum = (pick: (r: PRReport) => number): number => reports.reduce((total, r) => total + pick(r), 0);
  return {
    prs: reports.length,
    roundsWithNew: buildSum((r) => r.roundsWithNew),
    repeatClass: buildSum((r) => r.repeatClass),
    classUnknown: buildSum((r) => r.classUnknown),
    late: { n: buildSum((r) => r.late.n), of: buildSum((r) => r.late.of) },
    lateUnknown: buildSum((r) => r.lateUnknown),
    mainMerge: buildSum((r) => r.mainMerge),
    mergeUnknown: buildSum((r) => r.mergeUnknown),
  };
}
