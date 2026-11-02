export function parseContributedIssues(body: string | null | undefined): string[] {
  if (!body) {
    return [];
  }
  const found = [...body.matchAll(/\bContributes to:?\s+(?<issue>[A-Z][A-Z0-9]*-\d+)\b/gu)].flatMap((match) => (match.groups?.['issue'] ? [match.groups['issue']] : []));
  return [...new Set(found)];
}
