const NAMING_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:Fixes|Contributes to) (?<issue>GEO-\d+)\b/u;

// The issues a PR body names with a "Fixes GEO-n" or "Contributes to GEO-n" line. "Related to"
// names none.
export function collectNamedIssues(body: string): string[] {
  const issues = body.split(/\r?\n/u).flatMap((line) => {
    const match = NAMING_LINE.exec(line);
    return match?.groups?.['issue'] ? [match.groups['issue']] : [];
  });
  return [...new Set(issues)];
}
