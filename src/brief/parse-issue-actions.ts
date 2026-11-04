import type { IssueSection } from './types.ts';

const LIST_MARK = /^(?:[-*+]|\d+[.)])\s+/u;

// Linear writes a collapsible block as `+++ Title` or `>>> Title`, closed by the bare marker, with
// no heading of its own, so the Actions section would run on into an Agent notes block after it.
const COLLAPSIBLE_MARK = /^(?:\+\+\+|>>>)(?:\s|$)/u;

export function parseIssueActions(sections: readonly IssueSection[]): string[] {
  const section = sections.find((candidate) => candidate.name.toLowerCase() === 'actions');
  const body = section?.text.split('\n').slice(1) ?? [];
  const marker = body.findIndex((line) => COLLAPSIBLE_MARK.test(line.trim()));
  const end = marker === -1 ? body.length : marker;
  return body
    .slice(0, end)
    .map((line) => line.trim().replace(LIST_MARK, '').replaceAll('`', '').trim())
    .filter((line) => line !== '')
    .map((line) => (line.split(/[,:]/u)[0] ?? line).trim().replace(/\.$/u, ''));
}
