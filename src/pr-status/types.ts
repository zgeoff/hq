export interface CIOverrideView {
  check: string;
  head: string;
  source: string;
  note: string;
  at: string;
}

export interface AcceptedRiskView {
  finding: string;
  source: string;
  note: string;
  event: number;
  noslopState: string | null;
  noslopError?: string;
}

export type PRAnswer = 'lgtm' | 'changes' | 'reject';

export type PRGate = 'pass' | 'fail' | 'none';

export interface PRStatusView {
  repo: string;
  pr: number;
  head: string | null;
  headKnown: boolean;
  gate: PRGate | null;
  gateHead: string | null;
  gateAt: string | null;
  gateStale: boolean;
  answer: PRAnswer | null;
  answerHead: string | null;
  answerSource: string | null;
  answerNote: string | null;
  answerAt: string | null;
  answerStale: boolean;
  next: string | null;
  nextAt: string | null;

  override: { head: string; source: string; note: string; at: string } | null;

  ciOverrides: CIOverrideView[];

  reviewRecords: { mechanical: { files: string[]; lines: number } | null; exemption: { rule: string; note: string; files: string[] } | null };

  acceptedRisks: AcceptedRiskView[];
  updatedAt: string;
}

export interface PRKey {
  repo: string;
  pr: number;
}
