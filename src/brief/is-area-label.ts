import { NOT_AREA_LABELS } from './area-repos.ts';
import type { IssueLabel } from './types.ts';

const GROUPS = new Set(['Type', 'Size']);

export function isAreaLabel(label: IssueLabel): boolean {
  return !GROUPS.has(label.parent?.name ?? '') && !NOT_AREA_LABELS.has(label.name.toLowerCase());
}
