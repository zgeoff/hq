import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import { z } from 'zod';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { IN_SQL } from '../scope/in-sql.ts';
import { FIELDS } from './fields.ts';
import { NodeSchema } from './node-schema.ts';
import { parseLinearData } from './parse-linear-data.ts';
import { toIssue } from './to-issue.ts';
import type { LinearCall, LinearIssue } from './types.ts';
import { writeIssues as store } from './write-issues.ts';

const WantedIssueSchema = z.object({ issue: z.string() });
const IssuesSchema = z.object({ issues: z.object({ nodes: z.array(NodeSchema) }) });

export async function syncPrIssues(db: Database, call: LinearCall, max = 200): Promise<number> {
  const wantQuery = sql`SELECT DISTINCT p.issue FROM merged_prs p LEFT JOIN linear_issues l ON l.issue = p.issue WHERE p.issue IS NOT NULL AND l.issue IS NULL AND p.repo IN ${sql.raw(IN_SQL)} LIMIT ${max}`.compile(kdb(db));
  const want = runSyncQuery(db, wantQuery, WantedIssueSchema).map((row) => row.issue);
  let n = 0;
  for (let i = 0; i < want.length; i += 50) {
    const batch = want.slice(i, i + 50);
    const q = `query($ids: [ID!]) { issues(first: 50, includeArchived: true, filter: { id: { in: $ids } }) { nodes { ${FIELDS} } } }`;
    const answer = await call(q, { ids: batch });
    const data = parseLinearData(answer, IssuesSchema);
    const asked = new Set(batch);
    const got = data.issues.nodes.filter((node) => asked.has(node.identifier)).map((node) => toIssue(node));
    // An id Linear doesn't return (deleted, another team) is stored as none so it isn't asked again.
    const seen = new Set(got.map((g) => g.issue));
    store(db, [...got, ...batch.filter((b) => !seen.has(b)).map((b): LinearIssue => ({ issue: b, type: 'none', title: '', state: 'open', closed_at: null }))]);
    n += got.length;
  }
  return n;
}
