import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { collectEarlierPRAttachments, findExplicitSource, findPRLink, findPointedPR } from './find-pointed-pr.ts';
import type { PRAttachment } from './find-pointed-pr.ts';
import { pickFiledSource } from './pick-filed-source.ts';
import { readPRBody } from './read-pr-body.ts';
import type { LinearCall } from './types.ts';

const labelSchema = z.object({ name: z.string() });
const attachmentSchema = z.object({ url: z.string(), metadata: z.object({ createdAt: z.string().nullish() }).passthrough().nullish() });
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

interface SyncFiledOptions {
  to: Date;
  run: Runner;
}

export async function syncFiled(db: Database, call: LinearCall, from: Date, options: SyncFiledOptions): Promise<number> {
  const to = options.to;
  const query = `query($after: String, $from: DateTimeOrDuration!, $to: DateTimeOrDuration!) {
    issues(first: 100, after: $after, includeArchived: true, filter: { createdAt: { gte: $from, lt: $to } }) {
      nodes { identifier title createdAt description creator { app } labels { nodes { name } } attachments { nodes { url metadata } } }
      pageInfo { hasNextPage endCursor } } }`;
  const insert = db.query(`INSERT INTO linear_filed (issue, created_at, source, pr_ref, fetched_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (issue) DO UPDATE SET created_at = excluded.created_at, source = excluded.source, pr_ref = excluded.pr_ref, fetched_at = excluded.fetched_at`);
  let after: string | null = null;
  let count = 0;
  for (let page = 0; page < 40; page++) {
    const answer = await call(query, { after, from: iso(from), to: iso(to) });
    const issues = filedPageSchema.parse(answer).issues;
    const fetchedAt = iso(to);
    const rows: { node: z.infer<typeof filedNodeSchema>; source: string; pointedPR: string | null }[] = [];
    for (const node of issues.nodes) {
      const description = node.description ?? '';
      const labels = node.labels.nodes.map((label) => label.name);

      // A null creator is an issue an integration filed, with no Linear user behind it.
      const source = pickFiledSource({ title: node.title, description, labels, isBotCreator: node.creator === null || node.creator.app });
      const attachments = await readAttachments(options.run, node.attachments.nodes, description, node.createdAt);
      rows.push({ node, source, pointedPR: findPointedPR(description, attachments, node.createdAt, node.identifier) });
    }
    db.transaction(() => {
      for (const row of rows) {
        insert.run(row.node.identifier, iso(new Date(row.node.createdAt)), row.source, row.pointedPR, fetchedAt);
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

// Only an attachment that would otherwise count as the source PR costs a GitHub call.
async function readAttachments(run: Runner, nodes: readonly z.infer<typeof attachmentSchema>[], description: string, issueCreatedAt: string): Promise<PRAttachment[]> {
  const attachments: PRAttachment[] = nodes.map((attachment) => ({ url: attachment.url, openedAt: attachment.metadata?.createdAt ?? null }));
  if (findExplicitSource(description) !== null) {
    return attachments;
  }
  for (const attachment of collectEarlierPRAttachments(attachments, issueCreatedAt)) {
    const ref = findPRLink(attachment.url);
    const body = ref === null ? null : await readPRBody(run, ref);
    if (body !== null) {
      attachment.body = body;
    }
  }
  return attachments;
}
