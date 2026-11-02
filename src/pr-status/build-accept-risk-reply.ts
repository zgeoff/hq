export interface AcceptRiskReplyInput {
  finding: string;
  note: string;
  event: number;
  source: string;
}

type ReplyForm = 'inline' | 'issue';

// The disposition noslop reads is the first line only. An issue comment names its finding first,
// because it sits outside the finding's thread.
export function buildAcceptRiskReply(form: ReplyForm, input: AcceptRiskReplyInput): string {
  const disposition = form === 'inline' ? `accepted-risk ${input.note}` : `${input.finding} accepted-risk ${input.note}`;
  return `${disposition}\n\nRecorded in hq as event ${input.event} (source ${input.source}) by hq pr accept-risk.`;
}
