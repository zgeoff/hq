import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { IssueField } from './parse-issue-fields.ts';
import type { LinearCall } from './types.ts';

export const PAGE_SIZE = 100;
const MAX_PAGES = 200;

// A GraphQL filter on the issues of one team, in the given states, updated at or after a time.
export interface IssuesFilter {
  team: { key: { eq: string } };
  state: { name: { in: string[] } };
  updatedAt?: { gte: string } | undefined;
}

const QUERY = `query($after: String, $filter: IssueFilter!) {
  issues(first: ${PAGE_SIZE}, after: $after, filter: $filter) {
    nodes {
      identifier title url state { name type } project { name } priority priorityLabel
      labels { nodes { name } } parent { identifier } createdAt updatedAt completedAt canceledAt description
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const nameSchema = z.object({ name: z.string() });

const stateSchema = z.object({ name: z.string(), type: z.string() });

const identifierSchema = z.object({ identifier: z.string() });

const rawNodeSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
  state: stateSchema,
  project: nameSchema.nullable(),
  priority: z.number(),
  priorityLabel: z.string(),
  labels: z.object({ nodes: z.array(nameSchema) }),
  parent: identifierSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  canceledAt: z.string().nullable(),
  description: z.string().nullable(),
});

// The connector's shape of an issue: project {name}, priority {value, name}, labels [{name}].
const nodeSchema = rawNodeSchema.transform((node) => ({
  id: node.identifier,
  title: node.title,
  url: node.url,
  status: node.state.name,
  statusType: node.state.type,
  project: node.project,
  priority: { value: node.priority, name: node.priorityLabel },
  labels: node.labels.nodes,
  parentId: node.parent?.identifier ?? null,
  createdAt: node.createdAt,
  updatedAt: node.updatedAt,
  completedAt: node.completedAt,
  canceledAt: node.canceledAt,
  description: node.description,
}));

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

const issuesSchema = z.object({ nodes: z.array(nodeSchema), pageInfo: pageInfoSchema });

const pageSchema = z.object({ issues: issuesSchema });

export type IssuePage = Record<string, unknown>[];

// Every page of the filter's issues, each issue cut to the fields asked for. A failure on any page
// throws before the caller holds a page, so nothing is half read.
export async function readIssuePages(call: LinearCall, filter: IssuesFilter, fields: IssueField[]): Promise<IssuePage[]> {
  const pages: IssuePage[] = [];
  let after: string | null = null;
  for (;;) {
    if (pages.length === MAX_PAGES) {
      throw new HqError('linear_failed', `more than ${MAX_PAGES * PAGE_SIZE} issues match; hq reads no further`);
    }
    const answer = await call(QUERY, { after, filter });
    const parsed = pageSchema.safeParse(answer);
    if (!parsed.success) {
      throw new HqError('linear_failed', `Linear's issues answer has an unexpected shape: ${parsed.error.issues.at(0)?.path.join('.')}`);
    }
    const issues = parsed.data.issues;
    pages.push(issues.nodes.map((node) => pickFields(node, fields)));
    if (!issues.pageInfo.hasNextPage) {
      return pages;
    }
    if (issues.pageInfo.endCursor === null) {
      throw new HqError('linear_failed', 'Linear says another page follows but gave no cursor');
    }
    after = issues.pageInfo.endCursor;
  }
}

function pickFields(node: z.output<typeof nodeSchema>, fields: IssueField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, node[field]]));
}
