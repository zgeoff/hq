import { FOCUS_AREAS } from './focus-areas.ts';

// The areas an issue's labels name, in FOCUS_AREAS' order; none when it carries no area label.
export function getIssueAreas(labels: readonly string[]): string[] {
  const lower = new Set(labels.map((label) => label.toLowerCase()));
  return FOCUS_AREAS.filter((area) => lower.has(area));
}
