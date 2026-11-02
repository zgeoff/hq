import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { RenderedReport } from './types.ts';

const BURNDOWN = z.object({ total: z.number(), done: z.number(), triage: z.number() });
const CLOSED = z.object({ type: z.string().nullable(), count: z.number() });
const DAY = z.object({ date: z.string(), label: z.string(), prs: z.number(), issues: z.number() });
const GAP = z.object({ searchCount: z.number(), fetched: z.number() });
const ISSUE_LINK = z.object({ issue: z.string(), title: z.string(), url: z.string() });
const OPEN_PROJECT = z.object({ project: z.string(), issues: z.number(), top: z.array(ISSUE_LINK) });
const PR = z.object({ repo: z.string(), number: z.number(), url: z.string() });
const PR_NO_ISSUE = PR.extend({ title: z.string() });
const ROW = z.object({
  issue: z.string(),
  title: z.string(),
  url: z.string(),
  state: z.enum(['closed', 'canceled', 'open']),
  status: z.string(),
  marker: z.string(),
  flag: z.string().nullable(),
  prs: z.array(PR),
});
const SECTION = z.object({ project: z.string(), issues: z.number(), prs: z.number(), burndown: BURNDOWN.nullable(), rows: z.array(ROW) });
const TOTALS = z.object({ prs: z.number(), repos: z.number(), issues: z.number(), added: z.number(), removed: z.number(), closed: z.number() });
const WHOLE_REPORT = z.object({
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

export function parseRenderedReport(json: string): RenderedReport {
  const checked = WHOLE_REPORT.safeParse(JSON.parse(json));
  if (!checked.success) {
    throw new HqError('shipped_failed', `render-report.sh printed an unexpected shape: ${checked.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  return checked.data;
}
