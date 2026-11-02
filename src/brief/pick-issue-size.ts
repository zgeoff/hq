import { SIZES } from '../sizes/sizes.ts';
import type { Size } from '../sizes/bands.ts';
import type { IssueLabel } from './types.ts';

export function pickIssueSize(labels: readonly IssueLabel[]): Size | null {
  const label = labels.find((candidate) => candidate.parent?.name === 'Size');
  return SIZES.find((size) => size === label?.name) ?? null;
}
