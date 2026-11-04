export function hasIssueArea(labels: readonly string[], area: string): boolean {
  return labels.some((label) => label.toLowerCase() === area);
}
