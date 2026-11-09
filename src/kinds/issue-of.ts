import { parseIssueLinks } from '../parse-issue-links.ts';

export function issueOf(body: string | null | undefined): string | null {
  if (!body) return null;
  const link = parseIssueLinks(body).find((candidate) => candidate.keyword === candidate.relation && /^[A-Z][A-Z0-9]*-\d+$/u.test(candidate.id));
  return link?.id ?? null;
}
