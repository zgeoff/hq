import type { Database } from 'bun:sqlite';
import { IN_SQL } from '../scope/in-sql.ts';
import { FIELDS } from './fields.ts';
import { toIssue } from './to-issue.ts';
import type { LinearCall, LinearIssue, Node } from './types.ts';
import { writeIssues as store } from './write-issues.ts';

// The issues merged PRs name that hq has no type for yet; up to `max`, 50 to a query.
export async function syncPrIssues(db: Database, call: LinearCall, max = 200): Promise<number> {
  const want = (db.query(`SELECT DISTINCT p.issue FROM merged_prs p LEFT JOIN linear_issues l ON l.issue = p.issue WHERE p.issue IS NOT NULL AND l.issue IS NULL AND p.repo IN ${IN_SQL} LIMIT ?`).all(max) as { issue: string }[]).map((r) => r.issue);
  let n = 0;
  for (let i = 0; i < want.length; i += 50) {
    const batch = want.slice(i, i + 50);
    const q = `query($ids: [ID!]) { issues(first: 50, includeArchived: true, filter: { id: { in: $ids } }) { nodes { ${FIELDS} } } }`;
    const d = (await call(q, { ids: batch })) as { issues: { nodes: Node[] } };
    const asked = new Set(batch);
    const got = d.issues.nodes.filter((x) => asked.has(x.identifier)).map(toIssue);
    // An id Linear doesn't return (deleted, another team) is stored as none so it isn't asked again.
    const seen = new Set(got.map((g) => g.issue));
    store(db, [...got, ...batch.filter((b) => !seen.has(b)).map((b): LinearIssue => ({ issue: b, type: 'none', title: '', state: 'open', closed_at: null }))]);
    n += got.length;
  }
  return n;
}
