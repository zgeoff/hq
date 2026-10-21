import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { RenderedReport } from './types.ts';

// The part of render-report.sh --json the tab draws; a change to it fails here, by name. Each
// shape is named so the ones it holds come first.
const BURNDOWN = z.object({ total: z.number(), done: z.number(), triage: z.number() }),
  CLOSED = z.object({ type: z.string().nullable(), count: z.number() }),
  DAY = z.object({ date: z.string(), label: z.string(), prs: z.number(), issues: z.number() }),
  GAP = z.object({ searchCount: z.number(), fetched: z.number() }),
  ISSUE_LINK = z.object({ issue: z.string(), title: z.string(), url: z.string() }),
  OPEN_PROJECT = z.object({ project: z.string(), issues: z.number(), top: z.array(ISSUE_LINK) }),
  PR = z.object({ repo: z.string(), number: z.number(), url: z.string() }),
  PR_NO_ISSUE = PR.extend({ title: z.string() }),
  ROW = z.object({
    issue: z.string(),
    title: z.string(),
    url: z.string(),
    state: z.enum(['closed', 'canceled', 'open']),
    status: z.string(),
    marker: z.string(),
    flag: z.string().nullable(),
    prs: z.array(PR),
  }),
  SECTION = z.object({ project: z.string(), issues: z.number(), prs: z.number(), burndown: BURNDOWN.nullable(), rows: z.array(ROW) }),
  TOTALS = z.object({ prs: z.number(), repos: z.number(), issues: z.number(), added: z.number(), removed: z.number(), closed: z.number() }),
  WHOLE_REPORT = z.object({
    kind: z.enum(['daily', 'weekly']),
    dateLabel: z.string(),
    totals: TOTALS,
    closed: z.array(CLOSED),
    days: z.array(DAY).nullable(),
    groups: z.array(SECTION),
    stillOpen: z.array(OPEN_PROJECT).nullable(),
    noIssue: z.array(PR_NO_ISSUE),
    missing: z.array(z.string()),
    fetchGap: GAP.nullable(),
  }) satisfies z.ZodType<RenderedReport>;

// render-report.sh --json's output, checked; a shape hq doesn't know names the fields that differ.
export function parseRenderedReport(json: string): RenderedReport {
  const checked = WHOLE_REPORT.safeParse(JSON.parse(json));
  if (!checked.success) {
    throw new HqError('shipped_failed', `render-report.sh printed an unexpected shape: ${checked.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  return checked.data;
}
