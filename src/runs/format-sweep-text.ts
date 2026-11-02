import type { Alert } from './types.ts';

// Only a PR alert is cleared by a review record; each other alert names its own way out in its line.
export function formatSweepText(due: readonly Alert[]): string {
  const lines = [`hq run sweep: ${due.length} to look at.`, ...due.map((alert) => `- ${alert.line}`)];
  if (due.some((alert) => alert.key.startsWith('pr:'))) {
    lines.push('Record a review with hq run reviewed <pr> --sha <head>.');
  }
  return lines.join('\n');
}
