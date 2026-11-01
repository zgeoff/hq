import { AREA_REPOS } from './area-repos.ts';
import { isAreaLabel } from './is-area-label.ts';
import type { BriefIssue } from './types.ts';

export interface BriefArea {
  label: string;
  repo: string;
}

export type BriefAreas = { kind: 'known'; areas: BriefArea[] } | { kind: 'unknown'; label: string };

export function pickBriefAreas(issue: BriefIssue): BriefAreas {
  const labels = issue.labels
    .filter((label) => isAreaLabel(label))
    .map((label) => label.name.toLowerCase())
    .toSorted();
  const areas: BriefArea[] = [];
  for (const label of labels) {
    const repo = AREA_REPOS.get(label);
    if (repo === undefined || repo === null) {
      return { kind: 'unknown', label };
    }
    areas.push({ label, repo });
  }
  return { kind: 'known', areas };
}
