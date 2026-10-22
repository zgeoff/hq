import type { Skipped } from '../areas/types.ts';
import type { LaneRule, LaneRules, ReadyIssue } from './types.ts';

export interface ClassifiedReady {
  counts: Record<string, number>;
  total: number;
  skipped: Skipped[];
}

// Every Ready issue to one lane, or to skipped with a reason. First match wins: the exclusions, the
// lanes in lanes.json's order, then the fallback. counts holds every lane in the rules, zeros included.
export function classifyReady(issues: ReadyIssue[], rules: LaneRules): ClassifiedReady {
  const entries = Object.entries(rules.lanes);
  const ordered = entries.filter(([, rule]) => !rule.fallback);
  const fallback = entries.find(([, rule]) => rule.fallback)?.[0] ?? '';
  const counts: Record<string, number> = Object.fromEntries(entries.map(([name]) => [name, 0]));
  const skipped: Skipped[] = [];
  for (const issue of issues) {
    const excluded = rules.exclude.find((rule) => hasAny(rule.projects, issue.project) || rule.labels.some((label) => hasAny(issue.labels, label)));
    if (excluded) {
      skipped.push({ issue: issue.identifier, reason: excluded.reason });
      continue;
    }
    const lane = ordered.find(([, rule]) => isTakenBy(rule, issue))?.[0] ?? fallback;
    counts[lane] = (counts[lane] ?? 0) + 1;
  }
  return { counts, total: issues.length, skipped };
}

function hasAny(list: string[], value: string | null): boolean {
  return value !== null && list.some((entry) => entry.toLowerCase() === value.toLowerCase());
}

function isTakenBy(rule: LaneRule, issue: ReadyIssue): boolean {
  return rule.issues.includes(issue.identifier) || (issue.parent !== null && rule.childrenOf.includes(issue.parent)) || hasAny(rule.projects, issue.project) || rule.labels.some((label) => hasAny(issue.labels, label));
}
