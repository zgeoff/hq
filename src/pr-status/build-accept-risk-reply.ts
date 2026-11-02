export interface AcceptRiskReplyInput {
  finding: string;
  note: string;
  event: number;
  source: string;
}

// The disposition line names its finding, so it answers that finding only: noslop shares a folded
// comment's replies among every finding folded into it, and a bare `accepted-risk` line would answer
// them all. The trailer is a second line, which also keeps a single-line comment from answering all.
export function buildAcceptRiskReply(input: AcceptRiskReplyInput): string {
  return `${input.finding} accepted-risk ${input.note}\n\nRecorded in hq as event ${input.event} (source ${input.source}) by hq pr accept-risk.`;
}
