import { AREA_REPOS } from '../brief/area-repos.ts';
import { isAreaLabel } from '../brief/is-area-label.ts';
import type { TeamLabel } from './read-team-labels.ts';

export function collectUnmappedAreas(labels: readonly TeamLabel[]): string[] {
  const names = labels.filter((label) => !label.isGroup && isAreaLabel(label)).map((label) => label.name.toLowerCase());
  return [...new Set(names)].filter((name) => !AREA_REPOS.has(name)).toSorted();
}
