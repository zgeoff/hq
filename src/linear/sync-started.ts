import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import { parseStartedPrs } from './parse-started-prs.ts';
import type { StartedPr } from './parse-started-prs.ts';
import type { LinearCall } from './types.ts';

const attachmentsSchema = z.object({ nodes: z.array(z.unknown()) });
const startedNodeSchema = z.object({ identifier: z.string(), startedAt: z.string().nullable(), updatedAt: z.string(), attachments: attachmentsSchema.nullish() });
const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const startedPageSchema = z.object({ issues: z.object({ nodes: z.array(startedNodeSchema), pageInfo: pageInfoSchema }) });

// The issues In Progress at `at`, in place of the last read's.
export async function syncStarted(db: Database, call: LinearCall, at: Date): Promise<number> {
  const query = `query($after: String) {
    issues(first: 50, after: $after, filter: { state: { type: { eq: "started" } } }) {
      nodes { identifier startedAt updatedAt attachments(first: 20) { nodes { url sourceType metadata } } } pageInfo { hasNextPage endCursor } } }`;
  const started: { issue: string; startedAt: string; prs: StartedPr[] }[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40; page++) {
    const answer = await call(query, { after });
    const issues = startedPageSchema.parse(answer).issues;
    for (const node of issues.nodes) {
      // An issue moved straight into a started state without Linear stamping startedAt is aged from its last update.
      const startedAt = iso(new Date(node.startedAt ?? node.updatedAt));
      started.push({ issue: node.identifier, startedAt, prs: parseStartedPrs(node.attachments?.nodes ?? []) });
    }
    if (!issues.pageInfo.hasNextPage) {
      writeStarted(db, started, at);
      return started.length;
    }
    after = issues.pageInfo.endCursor;
  }
  throw new HqError('linear_failed', 'more than 2,000 issues In Progress; not recorded');
}

function writeStarted(db: Database, started: readonly { issue: string; startedAt: string; prs: readonly StartedPr[] }[], at: Date): void {
  const fetchedAt = iso(at);
  db.transaction(() => {
    db.query('DELETE FROM linear_started').run();
    db.query('DELETE FROM linear_started_prs').run();
    const insert = db.query('INSERT INTO linear_started (issue, started_at, fetched_at) VALUES (?, ?, ?)');
    const insertPr = db.query('INSERT INTO linear_started_prs (issue, ref, status, merged_at) VALUES (?, ?, ?, ?)');
    for (const row of started) {
      insert.run(row.issue, row.startedAt, fetchedAt);
      for (const pr of row.prs) {
        insertPr.run(row.issue, pr.ref, pr.status, pr.mergedAt);
      }
    }
  }).immediate();
}
