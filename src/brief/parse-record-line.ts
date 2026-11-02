import { parseIssueSections } from './parse-issue-sections.ts';

const HEADING = 'design brief (the record line)';

export function parseRecordLine(markdown: string, issueID: string): string | null {
  const section = parseIssueSections(markdown).find((candidate) => candidate.name.toLowerCase() === HEADING);
  const text = (section?.text.split('\n').slice(1) ?? [])
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(' ');
  return text === '' ? null : text.replaceAll('<GEO-n>', issueID);
}
