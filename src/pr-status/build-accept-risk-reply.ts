export interface AcceptRiskReplyInput {
  finding: string;
  note: string;
  event: number;
  source: string;
}

export type AcceptRiskReplyForm = "thread" | "issue";

// An issue comment needs two id-led lines: with one, noslop gives the whole text to every finding
// folded into the comment, and each reads it as accepted-risk.
export function buildAcceptRiskReply(
  input: AcceptRiskReplyInput,
  form: AcceptRiskReplyForm,
): string {
  const line = `${input.finding} accepted-risk ${input.note}`;
  const trailer = `Recorded in hq as event ${input.event} (source ${input.source}) by hq pr accept-risk.`;
  const answers = form === "issue" ? [line, line] : [line];
  return `${answers.join("\n")}\n\n${trailer}`;
}
