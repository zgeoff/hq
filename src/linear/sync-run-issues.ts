import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { ISSUE } from '../followups/issue.ts';
import { FIELDS } from './fields.ts';
import { toIssue } from './to-issue.ts';
import type { LinearCall } from './types.ts';
import { writeIssues } from './write-issues.ts';

const OPEN_RUNS = z.array(z.object({ issue: z.string() }));

const LABEL = z.object({
  name: z.string(),
  parent: z.object({ name: z.string() }).nullable().default(null),
});

const NODE = z.object({ identifier: z.string(), title: z.string(), completedAt: z.string().nullable(), canceledAt: z.string().nullable(), labels: z.object({ nodes: z.array(LABEL) }) });

const ANSWER = z.object({ issues: z.object({ nodes: z.array(NODE) }) });

// Re-reads the issue of each open run, 50 to a query, so the sweep sees an issue Linear closed.
// An issue Linear doesn't return keeps its last stored row. A run key that is not a Linear
// identifier, such as GEO-1-image, is never sent: Linear rejects the whole query for it.
export async function syncRunIssues(db: Database, call: LinearCall): Promise<number> {
  const issues = OPEN_RUNS.parse(
    db.query(`SELECT issue FROM runs WHERE state NOT IN ('done', 'dropped') ORDER BY issue`).all(),
  )
    .map((row) => row.issue)
    .filter((issue) => ISSUE.test(issue));
  let read = 0;
  for (let start = 0; start < issues.length; start += 50) {
    const batch = issues.slice(start, start + 50);
    const query = `query($ids: [ID!]) { issues(first: 50, includeArchived: true, filter: { id: { in: $ids } }) { nodes { ${FIELDS} } } }`;
    const raw = await call(query, { ids: batch });
    const answer = ANSWER.parse(raw);
    const asked = new Set(batch);
    const found = answer.issues.nodes
      .filter((node) => asked.has(node.identifier))
      .map((node) => toIssue(node));
    writeIssues(db, found);
    read += found.length;
  }
  return read;
}
