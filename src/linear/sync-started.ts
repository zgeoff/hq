import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import { parseStartedPrs } from './parse-started-prs.ts';
import type { StartedPr } from './parse-started-prs.ts';
import type { LinearCall } from './types.ts';

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const attachmentsSchema = z.object({ nodes: z.array(z.unknown()), pageInfo: pageInfoSchema.nullish() });
const startedNodeSchema = z.object({ identifier: z.string(), startedAt: z.string().nullable(), updatedAt: z.string(), attachments: attachmentsSchema.nullish() });
const startedPageSchema = z.object({ issues: z.object({ nodes: z.array(startedNodeSchema), pageInfo: pageInfoSchema }) });

const PAGE_SIZE = 50;
const MAX_PAGES = 40;

const STARTED_QUERY = `query($after: String) {
  issues(first: ${PAGE_SIZE}, after: $after, filter: { state: { name: { eq: "In Progress" } } }) {
    nodes { identifier startedAt updatedAt attachments(first: 20) { nodes { url sourceType metadata } pageInfo { hasNextPage endCursor } } }
    pageInfo { hasNextPage endCursor } } }`;

// Linear's page size keeps the query under its complexity limit, so 40 pages of 50 hold 2,000 issues.
export async function syncStarted(db: Database, call: LinearCall, at: Date): Promise<number> {
  const started: { issue: string; startedAt: string; prs: StartedPr[] }[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await call(STARTED_QUERY, { after });
    const issues = startedPageSchema.parse(answer).issues;
    for (const node of issues.nodes) {
      // An issue moved straight into a started state without Linear stamping startedAt is aged from its last update.
      const startedAt = iso(new Date(node.startedAt ?? node.updatedAt));
      const attachments = await readAllAttachments(call, node.identifier, node.attachments ?? null);
      started.push({ issue: node.identifier, startedAt, prs: parseStartedPrs(attachments) });
    }
    if (!issues.pageInfo.hasNextPage) {
      writeStarted(db, started, at);
      return started.length;
    }
    after = issues.pageInfo.endCursor;
  }
  throw new HqError('linear_failed', `more than ${MAX_PAGES * PAGE_SIZE} issues In Progress; not recorded`);
}

const ATTACHMENT_PAGE_SIZE = 50;
const MAX_ATTACHMENT_PAGES = 10;
const attachmentPageSchema = z.object({ issue: z.object({ attachments: attachmentsSchema }) });

const ATTACHMENT_QUERY = `query($id: String!, $after: String) {
  issue(id: $id) { attachments(first: ${ATTACHMENT_PAGE_SIZE}, after: $after) { nodes { url sourceType metadata } pageInfo { hasNextPage endCursor } } } }`;

// Every attachment of the issue: a partial list could hide an open PR behind merged ones.
async function readAllAttachments(call: LinearCall, issue: string, first: z.infer<typeof attachmentsSchema> | null): Promise<unknown[]> {
  const nodes = [...(first?.nodes ?? [])];
  let pageInfo = first?.pageInfo ?? null;
  for (let page = 0; pageInfo?.hasNextPage === true; page++) {
    if (page === MAX_ATTACHMENT_PAGES) {
      throw new HqError('linear_failed', `${issue} has more than ${20 + MAX_ATTACHMENT_PAGES * ATTACHMENT_PAGE_SIZE} attachments; In Progress issues not recorded`);
    }
    const answer = await call(ATTACHMENT_QUERY, { id: issue, after: pageInfo.endCursor });
    const attachments = attachmentPageSchema.parse(answer).issue.attachments;
    nodes.push(...attachments.nodes);
    pageInfo = attachments.pageInfo ?? null;
  }
  return nodes;
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
