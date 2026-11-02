import type { Answer } from './types.ts';

export function formatAnswerLine(a: Answer): string {
  const pickText = a.picked === null ? '' : `: ${a.picked}${a.stuPick === true ? " (Stu's pick)" : ''}`,
    sessionText = a.session === null ? '' : ` for ${a.session}`,
    titleText = a.title === null ? '' : ` "${a.title}"`,
    wholeLine = `${a.at} ${a.kind} ${a.id}${titleText}${sessionText}${pickText}`;
  return a.words === null ? wholeLine : `${wholeLine}\n    ${a.words.replaceAll('\n', '\n    ')}`;
}
