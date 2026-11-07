import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import type { LinearCall } from './types.ts';

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const inReviewNodeSchema = z.object({ identifier: z.string(), updatedAt: z.string() });
const inReviewPageSchema = z.object({ issues: z.object({ nodes: z.array(inReviewNodeSchema), pageInfo: pageInfoSchema }) });

const PAGE_SIZE = 50;
const MAX_PAGES = 40;

const IN_REVIEW_QUERY = `query($after: String) {
  issues(first: ${PAGE_SIZE}, after: $after, filter: { state: { name: { eq: "In Review" } } }) {
    nodes { identifier updatedAt }
    pageInfo { hasNextPage endCursor } } }`;

// Linear's page size keeps the query under its complexity limit, so 40 pages of 50 hold 2,000 issues.
export async function syncInReview(db: Database, call: LinearCall, at: Date): Promise<number> {
  const inReview: { issue: string; updatedAt: string }[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await call(IN_REVIEW_QUERY, { after });
    const issues = inReviewPageSchema.parse(answer).issues;
    for (const node of issues.nodes) {
      inReview.push({ issue: node.identifier, updatedAt: iso(new Date(node.updatedAt)) });
    }
    if (!issues.pageInfo.hasNextPage) {
      writeInReview(db, inReview, at);
      return inReview.length;
    }
    after = issues.pageInfo.endCursor;
  }
  throw new HqError('linear_failed', `more than ${MAX_PAGES * PAGE_SIZE} issues In Review; not recorded`);
}

function writeInReview(db: Database, inReview: readonly { issue: string; updatedAt: string }[], at: Date): void {
  const fetchedAt = iso(at);
  db.transaction(() => {
    db.query('DELETE FROM linear_in_review').run();
    const insert = db.query('INSERT INTO linear_in_review (issue, updated_at, fetched_at) VALUES (?, ?, ?)');
    for (const row of inReview) {
      insert.run(row.issue, row.updatedAt, fetchedAt);
    }
  }).immediate();
}
