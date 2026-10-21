export type PRAnswer = 'lgtm' | 'changes' | 'reject';

// 'none': the gate passed because noslop does not review the PR (not listed, a bot's PR, on Codex).
export type PRGate = 'pass' | 'fail' | 'none';

// A PR's record as the commands show it. A stale answer or gate was recorded at a head that is not
// the PR's head now; stale stays false when either head is unknown.
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

  // The owner's override of noslop's refusal at the head now, when one stands.
  override: { head: string; source: string; note: string; at: string } | null;
  updatedAt: string;
}

// The key of a PR's record.
export interface PRKey {
  repo: string;
  pr: number;
}
