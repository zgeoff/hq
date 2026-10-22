import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { findPointedPR } from './find-pointed-pr.ts';
import { pickFiledSource } from './pick-filed-source.ts';
import type { LinearCall } from './types.ts';

const labelSchema = z.object({ name: z.string() });
const attachmentSchema = z.object({ url: z.string() });
const creatorSchema = z.object({ app: z.boolean() });
const filedNodeSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  createdAt: z.string(),
  description: z.string().nullable(),
  creator: creatorSchema.nullable(),
  labels: z.object({ nodes: z.array(labelSchema) }),
  attachments: z.object({ nodes: z.array(attachmentSchema) }),
});
const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const filedPageSchema = z.object({ issues: z.object({ nodes: z.array(filedNodeSchema), pageInfo: pageInfoSchema }) });

// Every issue created in [from, to), stored with its source and the PR it points at; the
// description itself stays in Linear.
export async function syncFiled(db: Database, call: LinearCall, from: Date, to: Date = now()): Promise<number> {
  const query = `query($after: String, $from: DateTimeOrDuration!, $to: DateTimeOrDuration!) {
    issues(first: 100, after: $after, includeArchived: true, filter: { createdAt: { gte: $from, lt: $to } }) {
      nodes { identifier title createdAt description creator { app } labels { nodes { name } } attachments { nodes { url } } }
      pageInfo { hasNextPage endCursor } } }`;
  const insert = db.query(`INSERT INTO linear_filed (issue, created_at, source, pr_ref, fetched_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (issue) DO UPDATE SET created_at = excluded.created_at, source = excluded.source, pr_ref = excluded.pr_ref, fetched_at = excluded.fetched_at`);
  let after: string | null = null;
  let count = 0;
  for (let page = 0; page < 40; page++) {
    const answer = await call(query, { after, from: iso(from), to: iso(to) });
    const issues = filedPageSchema.parse(answer).issues;
    const fetchedAt = iso(to);
    db.transaction(() => {
      for (const node of issues.nodes) {
        const description = node.description ?? '';
        const labels = node.labels.nodes.map((label) => label.name);

        // A null creator is an issue an integration filed, with no Linear user behind it.
        const source = pickFiledSource({ title: node.title, description, labels, isBotCreator: node.creator === null || node.creator.app });
        const pointedPR = findPointedPR(description, node.attachments.nodes.map((attachment) => attachment.url));
        insert.run(node.identifier, iso(new Date(node.createdAt)), source, pointedPR, fetchedAt);
      }
    }).immediate();
    count += issues.nodes.length;
    if (!issues.pageInfo.hasNextPage) {
      return count;
    }
    after = issues.pageInfo.endCursor;
  }
  throw new HqError('linear_failed', 'more than 4,000 filed issues in the window; narrow it');
}
