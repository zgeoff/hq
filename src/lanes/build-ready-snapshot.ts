import type { LaneRules, ReadyIssue } from './types.ts';

const DESIGN = 'Design';

export function buildReadySnapshot(issues: readonly ReadyIssue[], rules: LaneRules, at: string): { at: string; eligible: ReadyIssue[]; design: ReadyIssue[] } {
  const eligible: ReadyIssue[] = [];
  const design: ReadyIssue[] = [];
  for (const issue of issues) {
    const excluding = rules.exclude.filter((rule) => hasAny(rule.projects, issue.project) || rule.labels.some((label) => hasAny(issue.labels, label)));
    if (excluding.length === 0) {
      eligible.push(issue);
    } else if (excluding.every((rule) => hasAny(rule.labels, DESIGN))) {
      design.push(issue);
    }
  }
  return { at, eligible, design };
}

function hasAny(list: readonly string[], value: string | null): boolean {
  return value !== null && list.some((entry) => entry.toLowerCase() === value.toLowerCase());
}
