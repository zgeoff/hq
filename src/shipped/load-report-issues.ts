import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { parseLinearData } from '../linear/parse-linear-data.ts';
import type { LinearCall } from '../linear/types.ts';
import { buildOpenExpiry } from './build-open-expiry.ts';
import { findCacheEntries } from './find-cache-entries.ts';
import { findValidBody } from './find-valid-body.ts';
import { reportIssueSchema } from './report-issue-schema.ts';
import type { ReportIssue } from './types.ts';
import { upsertCacheEntries } from './upsert-cache-entries.ts';

const LabelSchema = z.object({ name: z.string() });
const IssueNodeSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
  priority: z.number(),
  state: z.object({ name: z.string(), type: z.string() }),
  project: z.object({ name: z.string() }).nullable(),
  labels: z.object({ nodes: z.array(LabelSchema) }),
});
const IssuesSchema = z.object({ issues: z.object({ nodes: z.array(IssueNodeSchema) }) });

export async function loadReportIssues(call: LinearCall, db: Database, ids: readonly string[], at: Date): Promise<ReportIssue[]> {
  const BATCH = 100;
  const cached = await findCacheEntries(db, 'issue', ids, at);
  const fetched: ReportIssue[] = [];
  const hits = collectValidHits(cached);
  const wanted = ids.filter((id) => !hits.has(id));
  for (let i = 0; i < wanted.length; i += BATCH) {
    const answer = await call(QUERY, { ids: wanted.slice(i, i + BATCH) });
    const data = parseLinearData(answer, IssuesSchema);
    fetched.push(...data.issues.nodes.map((node) => toReportIssue(node)));
  }
  await upsertCacheEntries(
    db,
    fetched.map((issue) => ({ kind: 'issue', key: issue.id, body: JSON.stringify(issue), fetched_at: iso(at), expires_at: isFinished(issue) ? null : buildOpenExpiry(at) })),
  );
  return [...hits.values(), ...fetched];
}

function collectValidHits(cached: ReadonlyMap<string, string>): Map<string, ReportIssue> {
  const hits = new Map<string, ReportIssue>();
  for (const [id, body] of cached) {
    const issue = findValidBody(body, reportIssueSchema);
    if (issue !== undefined) {
      hits.set(id, issue);
    }
  }
  return hits;
}

const QUERY = `query($ids: [ID!]) { issues(first: 100, includeArchived: true, filter: { id: { in: $ids } }) {
  nodes { identifier title url priority state { name type } project { name } labels { nodes { name } } } } }`;

type IssueNode = z.output<typeof IssueNodeSchema>;

function toReportIssue(node: IssueNode): ReportIssue {
  return {
    id: node.identifier,
    title: node.title,
    url: node.url,
    status: node.state.name,
    statusType: node.state.type,
    project: node.project?.name ?? null,
    priority: node.priority,
    labels: node.labels.nodes.map((label) => label.name),
  };
}

function isFinished(issue: ReportIssue): boolean {
  return issue.statusType === 'completed' || issue.statusType === 'canceled';
}
