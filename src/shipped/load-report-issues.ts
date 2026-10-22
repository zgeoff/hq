import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import type { LinearCall } from '../linear/types.ts';
import { buildOpenExpiry } from './build-open-expiry.ts';
import { findCacheEntries } from './find-cache-entries.ts';
import { findValidBody } from './find-valid-body.ts';
import { reportIssueSchema } from './report-issue-schema.ts';
import type { ReportIssue } from './types.ts';
import { upsertCacheEntries } from './upsert-cache-entries.ts';

interface IssueNode {
  identifier: string;
  title: string;
  url: string;
  priority: number;
  state: { name: string; type: string };
  project: { name: string } | null;
  labels: { nodes: { name: string }[] };
}

// The Linear issues the merged PRs name, in the shape render-report.sh reads, 100 to a query. A Done
// or Canceled issue is kept for good, an open one for 5 minutes; only the others, and any kept in
// another shape, are asked for. An id Linear does not return is left out; the report names it.
export async function loadReportIssues(call: LinearCall, db: Database, ids: readonly string[], at: Date): Promise<ReportIssue[]> {
  const BATCH = 100,
    cached = await findCacheEntries(db, 'issue', ids, at),
    fetched: ReportIssue[] = [],
    hits = collectValidHits(cached),
    wanted = ids.filter((id) => !hits.has(id));
  for (let i = 0; i < wanted.length; i += BATCH) {
    const data = (await call(QUERY, { ids: wanted.slice(i, i + BATCH) })) as { issues: { nodes: IssueNode[] } };
    fetched.push(...data.issues.nodes.map((node) => toReportIssue(node)));
  }
  await upsertCacheEntries(
    db,
    fetched.map((issue) => ({ kind: 'issue', key: issue.id, body: JSON.stringify(issue), fetched_at: iso(at), expires_at: isFinished(issue) ? null : buildOpenExpiry(at) })),
  );
  return [...hits.values(), ...fetched];
}

// The kept issues that fit the schema, by id.
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
