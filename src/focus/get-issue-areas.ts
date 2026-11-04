export function getIssueAreas(labels: readonly string[], areas: readonly string[]): string[] {
  const lower = new Set(labels.map((label) => label.toLowerCase()));
  return areas.filter((area) => lower.has(area));
}
