import type { Database } from 'bun:sqlite';
import type { z } from 'zod';
import type { LinearCall } from '../linear/types.ts';
import type { Runner } from '../runner/types.ts';
import type { MergedPRsOutput } from './merged-prs-output-schema.ts';
import type { projectIssuesSchema } from './project-issues-schema.ts';
import type { reportIssueSchema } from './report-issue-schema.ts';

export type ShippedPeriod = 'today' | 'yesterday' | 'week';

// One PR as render-report.sh --json names it.
export interface ReportPR {
  repo: string;
  number: number;
  url: string;
}

// One issue's row: its markers, its state, and the PRs that merged for it.
export interface ReportRow {
  issue: string;
  title: string;
  url: string;
  state: 'closed' | 'canceled' | 'open';
  status: string;
  marker: string;
  flag: string | null;
  prs: ReportPR[];
}

export interface ReportGroup {
  project: string;
  issues: number;
  prs: number;
  burndown: { total: number; done: number; triage: number } | null;
  rows: ReportRow[];
}

// render-report.sh --json: the delivery report as data, with the groups, rows and order the
// Markdown shows. Days and the still-open list come only on a weekly report.
export interface RenderedReport {
  kind: 'daily' | 'weekly';
  dateLabel: string;
  totals: { prs: number; repos: number; issues: number; added: number; removed: number; closed: number };
  closed: { type: string | null; count: number }[];
  days: { date: string; label: string; prs: number; issues: number }[] | null;
  groups: ReportGroup[];
  stillOpen: { project: string; issues: number; top: { issue: string; title: string; url: string }[] }[] | null;
  noIssue: (ReportPR & { title: string })[];
  missing: string[];
  fetchGap: { searchCount: number; fetched: number } | null;
}

export interface ShippedReport {
  period: ShippedPeriod;
  report: RenderedReport;
  at: string;
}

// A Linear issue as render-report.sh reads it.
export type ReportIssue = z.infer<typeof reportIssueSchema>;

// One issue of a project, for its burndown.
export type ProjectIssue = z.infer<typeof projectIssuesSchema>[number];

// What the Shipped tab reads from: commands, Linear, the delivery-report scripts' folder, and the
// database that keeps what it has read.
export interface ShippedSources {
  db: Database;
  run: Runner;
  call: LinearCall;
  scripts: string;
}

// One merged PR as merged-prs.sh lists it.
export type MergedPR = MergedPRsOutput['prs'][number];
