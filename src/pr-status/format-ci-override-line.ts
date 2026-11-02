import type { CIOverrideView } from './types.ts';

export function formatCIOverrideLine(override: CIOverrideView): string {
  return `ci override: ${override.check} at ${override.head.slice(0, 7)} via ${override.source} (${override.at}): ${override.note}`;
}
