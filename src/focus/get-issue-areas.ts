import { FOCUS_AREAS } from './focus-areas.ts';

export function getIssueAreas(labels: readonly string[]): string[] {
  const lower = new Set(labels.map((label) => label.toLowerCase()));
  return FOCUS_AREAS.filter((area) => lower.has(area));
}
