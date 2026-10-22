import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import type { LinearCall } from './types.ts';

const startedNodeSchema = z.object({ identifier: z.string(), startedAt: z.string().nullable(), updatedAt: z.string() });
const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const startedPageSchema = z.object({ issues: z.object({ nodes: z.array(startedNodeSchema), pageInfo: pageInfoSchema }) });

// The issues In Progress at `at`, in place of the last read's.
export async function syncStarted(db: Database, call: LinearCall, at: Date): Promise<number> {
  const query = `query($after: String) {
    issues(first: 250, after: $after, filter: { state: { type: { eq: "started" } } }) {
      nodes { identifier startedAt updatedAt } pageInfo { hasNextPage endCursor } } }`;
  const started: { issue: string; startedAt: string }[] = [];
  let after: string | null = null;
  for (let page = 0; page < 8; page++) {
    const answer = await call(query, { after });
    const issues = startedPageSchema.parse(answer).issues;

    // An issue moved straight into a started state without Linear stamping startedAt is aged from its last update.
    started.push(...issues.nodes.map((node) => ({ issue: node.identifier, startedAt: iso(new Date(node.startedAt ?? node.updatedAt)) })));
    if (!issues.pageInfo.hasNextPage) {
      writeStarted(db, started, at);
      return started.length;
    }
    after = issues.pageInfo.endCursor;
  }
  throw new HqError('linear_failed', 'more than 2,000 issues In Progress; not recorded');
}

function writeStarted(db: Database, started: readonly { issue: string; startedAt: string }[], at: Date): void {
  const fetchedAt = iso(at);
  db.transaction(() => {
    db.query('DELETE FROM linear_started').run();
    const insert = db.query('INSERT INTO linear_started (issue, started_at, fetched_at) VALUES (?, ?, ?)');
    for (const row of started) {
      insert.run(row.issue, row.startedAt, fetchedAt);
    }
  }).immediate();
}
