import type { IssueSection } from './types.ts';

const LIST_MARK = /^(?:[-*+]|\d+[.)])\s+/u;

export function parseIssueActions(sections: readonly IssueSection[]): string[] {
  const section = sections.find((candidate) => candidate.name.toLowerCase() === 'actions');
  const body = section?.text.split('\n').slice(1) ?? [];
  return body
    .map((line) => line.trim().replace(LIST_MARK, '').replaceAll('`', '').trim())
    .filter((line) => line !== '')
    .map((line) => (line.split(/[,:]/u)[0] ?? line).trim().replace(/\.$/u, ''));
}
