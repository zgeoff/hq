import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iso } from '../clock/iso.ts';
import { loadMergedPRs } from './load-merged-prs.ts';
import { loadProjectIssues } from './load-project-issues.ts';
import { loadReportIssues } from './load-report-issues.ts';
import { parseMergedPRs } from './parse-merged-prs.ts';
import { parseRenderedReport } from './parse-rendered-report.ts';
import { runDeliveryScript } from './run-delivery-script.ts';
import type { ProjectIssue, ReportIssue, ShippedPeriod, ShippedReport, ShippedSources } from './types.ts';

export async function loadShippedReport(sources: ShippedSources, period: ShippedPeriod, at: Date): Promise<ShippedReport> {
  const dir = mkdtempSync(join(tmpdir(), 'hq-shipped-'));
  try {
    const listed = await loadMergedPRs(sources, period, at),
      merged = parseMergedPRs(listed),
      named = await loadReportIssues(sources.call, sources.db, merged.byIssue.map((entry) => entry.issue), at),
      projects = await loadProjectIssues(sources.call, sources.db, [...new Set(named.flatMap((issue) => (issue.project === null ? [] : [issue.project])))], at),
      stored = writeReportInputs(dir, listed, named, projects),
      text = await runDeliveryScript(sources, 'render-report.sh', ['--json', stored.prs, stored.issues, '--projects', stored.projects]);
    return { period, report: parseRenderedReport(text), at: iso(at) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeReportInputs(dir: string, prs: string, issues: readonly ReportIssue[], projects: readonly ProjectIssue[]): Record<'prs' | 'issues' | 'projects', string> {
  const paths = { prs: join(dir, 'prs.json'), issues: join(dir, 'issues.json'), projects: join(dir, 'projects.json') };
  writeFileSync(paths.prs, prs);
  writeFileSync(paths.issues, JSON.stringify(issues));
  writeFileSync(paths.projects, JSON.stringify(projects));
  return paths;
}
