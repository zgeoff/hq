import { collectFencedLines } from './collect-fenced-lines.ts';
import type { IssueSection } from './types.ts';

const HEADING = /^(?<hashes>#{1,6})\s+(?<name>.+?)\s*$/u;

// The headed sections of an issue description, in order. A section runs to the next heading of the
// same or a higher level, so one that holds a lower heading holds its text too, and the lower
// heading is a section of its own. A heading inside a code fence is text.
export function parseIssueSections(description: string): IssueSection[] {
  const lines = description.split('\n');
  const starts: { index: number; level: number; name: string }[] = [];
  const fenced = collectFencedLines(lines);
  for (const [index, line] of lines.entries()) {
    const heading = fenced[index] === true ? null : HEADING.exec(line)?.groups;
    if (heading) {
      starts.push({ index, level: heading['hashes']?.length ?? 1, name: heading['name'] ?? '' });
    }
  }
  return starts.map((start, position) => {
    const end = starts.slice(position + 1).find((next) => next.level <= start.level)?.index ?? lines.length;
    return { name: start.name, text: lines.slice(start.index, end).join('\n').trim() };
  });
}
