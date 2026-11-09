import { parseIssueLinks } from '../parse-issue-links.ts';

export function findLinkedIssue(body: string): string | null {
  const link = parseIssueLinks(body).find((candidate) => candidate.id.toUpperCase().startsWith('GEO-'));
  return link?.id.toUpperCase() ?? null;
}
