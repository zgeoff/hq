import type { PRStatusView } from './types.ts';

export function formatOverrideLine(override: NonNullable<PRStatusView['override']>): string {
  return `override: at ${override.head.slice(0, 7)} via ${override.source} (${override.at}): ${override.note}`;
}
