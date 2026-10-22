import type { GoalRow } from './types.ts';

export function goalLine(r: GoalRow): string {
  const x = r.deploys;
  const deployText = x ? `${x.runs} runs (applies ${x.applied_ok} ok, ${x.applied_failed} failed${x.applied_cancelled ? `, ${x.applied_cancelled} cancelled` : ''}; ${x.held} held, ${x.no_apply} no-apply${x.unknown ? `, ${x.unknown} unknown outcome` : ''}${x.unclassified ? `, ${x.unclassified} not yet classified` : ''}${x.running ? `, ${x.running} running` : ''})` : 'n/a';
  const l = r.log ? `${r.log.deploy}/${r.log.hold}` : 'n/a';
  const c = r.ci;
  return `  ${`${r.label}${r.partial ? ' so far' : ''}`.padEnd(20)} deploy-prod ${deployText}; log DEPLOY/HOLD ${l}; CI ${formatNumber(c.runs)} runs, ${formatNumber(c.failed)} failed (${formatPercent(c.failed, c.runs)}), ${formatNumber(c.cancelled)} cancelled (${formatPercent(c.cancelled, c.runs)}), ${formatNumber(c.reruns)} re-run, ${formatNumber(c.minutes)} min, ${formatNumber(c.wasteMinutes)} in failed or cancelled (${formatPercent(c.wasteMinutes, c.minutes)})${c.missing ? ` [${c.missing} day(s) not fetched]` : ''}; PRs ${formatNumber(r.merged)} merged, ${r.closedUnmerged} closed unmerged (${formatPercent(r.closedUnmerged, r.merged + r.closedUnmerged)})`;
}

function formatPercent(a: number, b: number): string {
  return b ? `${Math.round((100 * a) / b)}%` : '–';
}

function formatNumber(x: number): string {
  return x.toLocaleString('en-AU');
}
