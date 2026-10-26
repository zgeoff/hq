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
    formatChurn(r),
  ].join('\n');
}

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)} s`;
}

function formatChurn(churn: Churn & { baseMove: number }): string {
  const parts = [`${churn.roundsWithNew} round${churn.roundsWithNew === 1 ? '' : 's'} with a new finding`, `${churn.repeatClass} repeat-class${formatUnknown(churn.classUnknown)}`, `late ${churn.late.n} of ${churn.late.of}${formatUnknown(churn.lateUnknown)}`, `${churn.mainMerge} main-merge${formatUnknown(churn.mergeUnknown)}`, `${churn.baseMove} base-move`];
  return `  churn: ${parts.join(', ')}`;
}

function formatUnknown(n: number): string {
  return n > 0 ? ` (${n} unknown)` : '';
}
