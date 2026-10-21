import type { Out } from '../commands.ts';
import { sydney } from '../morning/sydney.ts';
import type { AnswerWeek } from './types.ts';

// `hq stats` with the owner's yes/no count per Sydney week: in its data, and as a section right after
// "Wait on the owner", the second block of the text.
export function mergeAnswerWeeks(stats: Out, weeks: readonly AnswerWeek[]): Out {
  const blocks = stats.text.split('\n\n');
  return { data: { ...stats.data, answerWeeks: weeks }, text: [...blocks.slice(0, 2), formatAnswerWeeks(weeks).join('\n'), ...blocks.slice(2)].join('\n\n') };
}

function formatAnswerWeeks(weeks: readonly AnswerWeek[]): string[] {
  return ["Yes/no's the owner answered (calls, proposals, reviews; a standing grant shows as a drop; hq answers lists them)", ...weeks.map((week) => `  week of ${sydney(new Date(week.from)).date}: ${week.answered}${week.partial ? ' (so far)' : ''}`)];
}
