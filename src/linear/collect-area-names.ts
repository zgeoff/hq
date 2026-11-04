import { isAreaLabel } from '../brief/is-area-label.ts';
import type { TeamLabel } from './read-team-labels.ts';

export function collectAreaNames(labels: readonly TeamLabel[]): string[] {
  const names = labels.filter((label) => !label.isGroup && isAreaLabel(label)).map((label) => label.name.toLowerCase());
  return [...new Set(names)].toSorted();
}
