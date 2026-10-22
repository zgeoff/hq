import { buildNoslopTotals } from './build-noslop-totals.ts';
import type { PRReport } from './build-noslop-report.ts';
import type { Churn } from './count-churn.ts';

export function renderNoslopReport(reports: PRReport[]): string {
  if (reports.length === 0) {
    return 'No noslop rounds.';
  }
  const totals = buildNoslopTotals(reports);
  return [...reports.map((r) => formatPRReport(r)), `totals: ${totals.prs} PR${totals.prs === 1 ? '' : 's'}\n${formatChurn(totals)}`].join('\n\n');
}

function formatPRReport(r: PRReport): string {
  const answered = r.answered === null ? '' : `, ${r.answered} answered`,
    confirm = r.confirmReviews > 0 ? `, ${r.confirmReviews} --confirm` : '',
    full = r.fullReviews > 0 ? `, ${r.fullReviews} full` : '',
    open = r.openIDs.length > 0 ? `, open: ${r.openIDs.join(', ')}` : '',
    plural = r.extraRounds === 1 ? '' : 's',
    severities = Object.entries(r.bySeverity).map(([severity, n]) => `${n} ${severity}`).join(', '),
    span = r.reviewToPassMs === null ? '' : `; first review to first passing check: ${formatSeconds(r.reviewToPassMs)}`;
  return [
    r.ref,
    `  reviews: ${r.reviewsOk} ok, ${r.reviewsFailed} failed (${r.extraRounds} extra round${plural}${full}${confirm})`,
    `  findings: ${r.findings}${severities === '' ? '' : ` (${severities})`}`,
    `  latest check: ${r.latestCheck ?? 'none'}${answered}${open}`,
    `  wall time: ${formatSeconds(r.wallMs)}${span}`,
    ...formatRedesign(r),
    formatChurn(r),
  ].join('\n');
}

function formatRedesign(r: PRReport): string[] {
  if (r.redesign === null) {
    return [];
  }
  return [`  redesign: ${r.redesign}`];
}

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)} s`;
}

function formatChurn(c: Churn): string {
  const parts = [`${c.roundsWithNew} round${c.roundsWithNew === 1 ? '' : 's'} with a new finding`, `${c.repeatClass} repeat-class${formatUnknown(c.classUnknown)}`, `late ${c.late.n} of ${c.late.of}${formatUnknown(c.lateUnknown)}`, `${c.mainMerge} main-merge${formatUnknown(c.mergeUnknown)}`];
  return `  churn: ${parts.join(', ')}`;
}

function formatUnknown(n: number): string {
  return n > 0 ? ` (${n} unknown)` : '';
}
