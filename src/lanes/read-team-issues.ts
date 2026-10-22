import { z } from 'zod';
import { HqError } from '../errors.ts';
import { ISSUE_TYPES } from '../linear/issue-types.ts';
import type { IssueType } from '../linear/issue-types.ts';
import type { LinearCall } from '../linear/types.ts';
import type { ReadyIssue } from './types.ts';

const MAX_PAGES = 20;

const QUERY = `query($after: String, $team: String!, $state: String!) {
  issues(first: 250, after: $after, filter: { team: { key: { eq: $team } }, state: { name: { eq: $state } } }) {
    nodes { identifier priority createdAt project { name labels { nodes { name } } } labels { nodes { name parent { name } } } parent { identifier } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const nameSchema = z.object({ name: z.string() });

const labelSchema = z.object({ name: z.string(), parent: nameSchema.nullish() });

const projectSchema = z.object({ name: z.string(), labels: z.object({ nodes: z.array(nameSchema) }) });

const nodeSchema = z.object({
  identifier: z.string(),
  priority: z.number(),
  createdAt: z.string(),
  project: projectSchema.nullable(),
  labels: z.object({ nodes: z.array(labelSchema) }),
  parent: z.object({ identifier: z.string() }).nullable(),
});

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

const pageSchema = z.object({ issues: z.object({ nodes: z.array(nodeSchema), pageInfo: pageInfoSchema }) });

export type ReadyPageAnswer = z.input<typeof pageSchema>;

// Every issue of the team in one workflow state, page by page. A failure on any page throws, so a
// caller never acts on part of the list.
export async function readTeamIssues(call: LinearCall, team: string, state: string): Promise<ReadyIssue[]> {
  const issues: ReadyIssue[] = [];
  let after: string | null = null;
  for (let page = 0; ; page++) {
    if (page === MAX_PAGES) {
      throw new HqError('linear_failed', `more than ${MAX_PAGES * 250} ${state} issues; hq reads no further`);
    }
    const answer = await call(QUERY, { after, team, state });
    const parsed = pageSchema.safeParse(answer);
    if (!parsed.success) {
      throw new HqError('linear_failed', `Linear's ${state} answer has an unexpected shape: ${parsed.error.issues.at(0)?.path.join('.')}`);
    }
    const nodes = parsed.data.issues.nodes;
    issues.push(...nodes.map((node) => toReadyIssue(node)));
    if (!parsed.data.issues.pageInfo.hasNextPage) {
      break;
    }
    after = parsed.data.issues.pageInfo.endCursor;
  }
  return issues;
}

function toReadyIssue(node: z.infer<typeof nodeSchema>): ReadyIssue {
  return {
    identifier: node.identifier,
    project: node.project?.name ?? null,
    projectLabels: node.project?.labels.nodes.map((label) => label.name) ?? [],
    labels: node.labels.nodes.map((label) => label.name),
    type: pickType(node.labels.nodes),
    priority: node.priority,
    createdAt: node.createdAt,
    parent: node.parent?.identifier ?? null,
  };
}

function pickType(labels: z.infer<typeof labelSchema>[]): IssueType {
  const typeLabel = labels.find((label) => label.parent?.name === 'Type');
  return ISSUE_TYPES.find((type) => type === typeLabel?.name) ?? 'none';
}
