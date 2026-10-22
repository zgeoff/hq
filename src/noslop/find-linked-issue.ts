// LINK_KINDS rank Fixes first, then Contributes to, then Related to: the issue the PR does most for.
const LINK_KINDS = ['fixes', 'contributes to', 'related to'],
  LINK_PATTERN = /\b(?<kind>fixes|contributes to|related to):?\s+(?<id>GEO-\d+)\b/giu;

// The GEO-n the body links with the strongest relationship, or null.
export function findLinkedIssue(body: string): string | null {
  const links = [...body.matchAll(LINK_PATTERN)].map((m) => ({ rank: LINK_KINDS.indexOf((m.groups?.['kind'] ?? '').toLowerCase()), id: (m.groups?.['id'] ?? '').toUpperCase() }));
  links.sort((a, b) => a.rank - b.rank);
  return links[0]?.id ?? null;
}
