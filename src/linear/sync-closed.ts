import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { z } from 'zod';
import { FIELDS } from './fields.ts';
import { NodeSchema } from './node-schema.ts';
import { parseLinearData } from './parse-linear-data.ts';
import { toIssue } from './to-issue.ts';
import type { LinearCall } from './types.ts';
import { writeIssues as store } from './write-issues.ts';

const ClosedPageSchema = z.object({ issues: z.object({ nodes: z.array(NodeSchema), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }) }) });

export async function syncClosed(db: Database, call: LinearCall, from: Date, to: Date = now()): Promise<number> {
  const q = `query($after: String, $from: DateTimeOrDuration!, $to: DateTimeOrDuration!) {
    issues(first: 250, after: $after, includeArchived: true, filter: { or: [{ completedAt: { gte: $from, lt: $to } }, { canceledAt: { gte: $from, lt: $to } }] }) {
      nodes { ${FIELDS} } pageInfo { hasNextPage endCursor } } }`;
  let after: string | null = null;
  let n = 0;
  for (let page = 0; page < 40; page++) {
    const d: z.output<typeof ClosedPageSchema> = parseLinearData(await call(q, { after, from: iso(from), to: iso(to) }), ClosedPageSchema);
    store(db, d.issues.nodes.map(toIssue));
    n += d.issues.nodes.length;
    if (!d.issues.pageInfo.hasNextPage) return n;
    after = d.issues.pageInfo.endCursor;
  }
  throw new HqError('linear_failed', 'more than 10,000 closed issues in the window; narrow it');
}
