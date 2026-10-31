import { AREA_REPOS, NOT_AREA_LABELS } from './area-repos.ts';
import type { BriefIssue } from './types.ts';

export interface BriefArea {
  label: string;
  repo: string;
}

export type BriefAreas = { kind: 'known'; areas: BriefArea[] } | { kind: 'unknown'; label: string };

const GROUPS = new Set(['Type', 'Size']);

export function pickBriefAreas(issue: BriefIssue): BriefAreas {
  const labels = issue.labels
    .filter((label) => !GROUPS.has(label.parent?.name ?? '') && !NOT_AREA_LABELS.has(label.name.toLowerCase()))
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
