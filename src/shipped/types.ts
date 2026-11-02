import type { Database } from 'bun:sqlite';
import type { z } from 'zod';
import type { LinearCall } from '../linear/types.ts';
import type { Runner } from '../runner/types.ts';
import type { MergedPRsOutput } from './merged-prs-output-schema.ts';
import type { projectIssuesSchema } from './project-issues-schema.ts';
import type { reportIssueSchema } from './report-issue-schema.ts';

export type ShippedPeriod = 'today' | 'yesterday' | 'week';

export interface ReportPR {
  repo: string;
  number: number;
  url: string;
}

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

export type ReportIssue = z.infer<typeof reportIssueSchema>;

export type ProjectIssue = z.infer<typeof projectIssuesSchema>[number];

export interface ShippedSources {
  db: Database;
  run: Runner;
  call: LinearCall;
  scripts: string;
}

export type MergedPR = MergedPRsOutput['prs'][number];
