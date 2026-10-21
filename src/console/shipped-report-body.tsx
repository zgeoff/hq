import { Fragment } from 'react';
import type { RenderedReport, ReportGroup, ReportRow } from '../shipped/types.ts';
import { formatCount } from './format-count.ts';
import { formatReportTitle } from './format-report-title.ts';
import { pickStatePill } from './pick-state-pill.ts';
import { ShippedRow } from './shipped-row.tsx';

interface ShippedReportBodyProps {
  report: RenderedReport;
}

// The delivery report drawn from render-report.sh --json: the totals as the title, then each
// project's rows, the PRs with no issue, and the report's notes. The script picks the groups,
// rows, order and markers; the page only lays them out.
export function ShippedReportBody(props: ShippedReportBodyProps) {
  const report = props.report;
  return (
    <article className="hq-shipped">
      <h1 className="hq-shipped-total">{formatReportTitle(report)}</h1>
      {report.totals.prs === 0 && <p className="hq-shipped-none">Nothing merged in this period.</p>}
      {report.days !== null && (
        <ul className="hq-shipped-days">
          {report.days.map((day) => (
            <li key={day.date}>
              {day.label}: {formatCount(day.prs, 'PR')}, {formatCount(day.issues, 'issue')}
            </li>
          ))}
        </ul>
      )}
      <p className="hq-shipped-line">Closed: {formatClosed(report.closed)}.</p>
      {report.groups.map((group) => (
        <section key={group.project} className="hq-shipped-section">
          <h2 className="hq-shipped-group">
            <strong>{group.project}</strong> {formatGroupCounts(group)}
          </h2>
          <ul className="hq-shipped-rows">
            {group.rows.map((row) => (
              <ShippedRow key={row.issue} markers={collectMarkers(row)} label={row.issue} title={row.title} url={row.url} pill={pickStatePill(row)} prs={row.prs} />
            ))}
          </ul>
        </section>
      ))}
      {report.stillOpen !== null && report.stillOpen.length > 0 && (
        <section className="hq-shipped-section">
          <h2 className="hq-shipped-group">
            <strong>Still open</strong>
          </h2>
          <ul className="hq-shipped-days">
            {report.stillOpen.map((open) => (
              <li key={open.project}>
                {open.project}: {formatCount(open.issues, 'issue')}, most PRs on{' '}
                {open.top.map((top, index) => (
                  <Fragment key={top.issue}>
                    {index > 0 && ', '}
                    <a href={top.url} target="_blank" rel="noreferrer">
                      {top.issue} {top.title}
                    </a>
                  </Fragment>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.noIssue.length > 0 && (
        <section className="hq-shipped-section">
          <h2 className="hq-shipped-group">
            <strong>No issue</strong> ({formatCount(report.noIssue.length, 'PR')})
          </h2>
          <ul className="hq-shipped-rows">
            {report.noIssue.map((pr) => (
              <ShippedRow key={pr.url} markers={[]} label={pr.repo} title={pr.title} url={pr.url} pill={null} prs={[pr]} />
            ))}
          </ul>
        </section>
      )}
      {report.missing.length > 0 && <p className="hq-shipped-line">Not found in Linear: {report.missing.join(', ')}.</p>}
      {report.fetchGap !== null && (
        <p className="hq-shipped-line">
          GitHub found {report.fetchGap.searchCount} PRs, but only {report.fetchGap.fetched} arrived.
        </p>
      )}
    </article>
  );
}

// "1 bug, 2 chores, 1 untyped", as the delivery report words its closed line; "none" for none.
function formatClosed(closed: RenderedReport['closed']): string {
  const parts = closed.map((entry) => (entry.type === null ? `${entry.count} untyped` : `${entry.count} ${entry.type.toLowerCase()}${entry.count === 1 ? '' : 's'}`));
  return parts.length === 0 ? 'none' : parts.join(', ');
}

function formatGroupCounts(group: ReportGroup): string {
  const counts = `(${formatCount(group.issues, 'issue')}, ${formatCount(group.prs, 'PR')})`,
    done = group.burndown;
  if (done === null) {
    return counts;
  }
  return `${counts} · ${done.done} of ${done.total} done${done.triage > 0 ? `, ${done.triage} in Triage` : ''}`;
}

function collectMarkers(row: ReportRow): string[] {
  return row.flag === null ? [row.marker] : [row.marker, row.flag];
}
