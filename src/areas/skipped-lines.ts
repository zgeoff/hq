import type { ReadySummary } from './types.ts';

export function skippedLines(s: ReadySummary, max = 10): string[] {
  return [...s.skipped.slice(0, max).map((x) => `  ${x.issue}: ${x.reason}`), ...(s.skipped.length > max ? [`  +${s.skipped.length - max} more`] : [])];
}
