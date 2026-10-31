import { HqError } from '../errors.ts';
import { AREA_REPOS, NOT_AREA_LABELS } from './area-repos.ts';
import type { BriefIssue } from './types.ts';

export interface BriefArea {
  label: string;
  repo: string;
}

const GROUPS = new Set(['Type', 'Size']);

export function pickBriefAreas(issue: BriefIssue): BriefArea[] {
  const labels = issue.labels
    .filter((label) => !GROUPS.has(label.parent?.name ?? '') && !NOT_AREA_LABELS.has(label.name.toLowerCase()))
    .map((label) => label.name.toLowerCase())
    .toSorted();
  return labels.map((label) => {
    const repo = AREA_REPOS.get(label);
    if (repo === undefined || repo === null) {
      throw new HqError('bad_state', `${issue.identifier} has the label ${label}, which names no repo hq knows: add it to AREA_REPOS in src/brief/area-repos.ts, or take it off the issue`);
    }
    return { label, repo };
  });
}
