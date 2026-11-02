import type { RenderedReport } from '../shipped/types.ts';
import { formatCount } from './format-count.ts';

export function formatReportTitle(report: RenderedReport): string {
  const counts = `${formatCount(report.totals.prs, 'PR')} across ${formatCount(report.totals.repos, 'repo')}, covering ${formatCount(report.totals.issues, 'issue')}, ${report.totals.closed} closed.`;
  const totals = report.totals;
  if (report.kind === 'daily') {
    return `${report.dateLabel}: ${counts}`;
  }
  return `Week of ${report.dateLabel}: ${counts} +${totals.added.toLocaleString('en-AU')} −${totals.removed.toLocaleString('en-AU')}.`;
}
