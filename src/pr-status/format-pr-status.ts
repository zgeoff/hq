import { formatCIOverrideLine } from './format-ci-override-line.ts';
import { formatOverrideLine } from './format-override-line.ts';
import { formatReviewRecordsLine } from './format-review-records-line.ts';
import { formatAnswerSource } from './format-answer-source.ts';
import { isRebasedSource } from './is-rebased-source.ts';
import type { PRStatusView } from './types.ts';

// The record in words. A stale line says `stale at <short head>`, the head it was recorded at.
export function formatPRStatus(view: PRStatusView): string {
  const lines = [`${view.repo}#${view.pr}  ${formatHead(view)}`, formatGateLine(view), formatAnswerLine(view), formatNextLine(view)];
  if (view.override !== null) {
    lines.push(formatOverrideLine(view.override));
  }
  lines.push(...view.ciOverrides.map((override) => formatCIOverrideLine(override)));
  const records = formatReviewRecordsLine(view.reviewRecords);
  if (records !== null) {
    lines.push(records);
  }
  if (!view.headKnown) {
    lines.push('The PR head could not be read, so stale is unknown.');
  }
  return lines.join('\n');
}

function formatGateLine(view: PRStatusView): string {
  if (view.gate === null) {
    return 'gate: not recorded';
  }
  if (view.gate === 'none') {
    return `gate: none (noslop does not review this PR, or it is a bot PR with no noslop review)${formatWhen(view.gateAt)}`;
  }
  return `gate: ${view.gate} ${formatAt(view.gateHead, view.gateStale)}${formatWhen(view.gateAt)}`;
}

function formatAnswerLine(view: PRStatusView): string {
  if (view.answer === null) {
    return 'answer: none';
  }
  const at = formatAt(view.answerHead, view.answerStale);
  const when = formatWhen(view.answerAt);
  if (view.answerSource !== null && isRebasedSource(view.answerSource)) {
    const carried = view.answerNote === null ? '' : ` (${view.answerNote})`;
    return `answer: ${view.answer} ${at} via ${formatAnswerSource(view.answerSource)}${carried}${when}`;
  }
  const note = view.answerNote === null ? '' : `: ${view.answerNote}`,
    source = view.answerSource === null ? '' : ` via ${view.answerSource}`;
  return `answer: ${view.answer} ${at}${source}${when}${note}`;
}

function formatNextLine(view: PRStatusView): string {
  return view.next === null ? 'next: nobody' : `next: ${view.next}${formatWhen(view.nextAt)}`;
}

function formatHead(view: PRStatusView): string {
  if (view.head === null) {
    return 'head never seen';
  }
  return view.headKnown ? `head ${view.head.slice(0, 7)}` : `last seen head ${view.head.slice(0, 7)}`;
}

function formatAt(head: string | null, stale: boolean): string {
  if (head === null) {
    return 'head unknown';
  }
  return stale ? `stale at ${head.slice(0, 7)}` : `at ${head.slice(0, 7)}`;
}

function formatWhen(at: string | null): string {
  return at === null ? '' : ` (${at})`;
}
