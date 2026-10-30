// Every Linear issue a PR body says it contributes to, in order, once each.
export function contributedIssues(body: string | null | undefined): string[] {
  if (!body) return [];
  const found = [...body.matchAll(/\bContributes to:?\s+([A-Z][A-Z0-9]*-\d+)\b/g)].map((m) => m[1]!);
  return [...new Set(found)];
}
