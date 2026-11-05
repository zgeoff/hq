import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { LinearCall } from '../linear/types.ts';
import { pickIssueType } from './pick-issue-type.ts';
import type { ReadyIssue, TeamIssue } from './types.ts';

const PAGE_SIZE = 50;
const MAX_PAGES = 100;

// inverseRelations holds the relations that point at the issue: a `blocks` one names its blocker.
const QUERY = `query($after: String, $team: String!, $state: String!) {
  issues(first: ${PAGE_SIZE}, after: $after, filter: { team: { key: { eq: $team } }, state: { name: { eq: $state } } }) {
    nodes { identifier priority createdAt project { name labels { nodes { name } } } labels { nodes { name parent { name } } } parent { identifier }
      inverseRelations(first: 50) { nodes { type issue { identifier state { type } } } pageInfo { hasNextPage } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const nameSchema = z.object({ name: z.string() });

const labelSchema = z.object({ name: z.string(), parent: nameSchema.nullish() });

const projectSchema = z.object({ name: z.string(), labels: z.object({ nodes: z.array(nameSchema) }) });

const blockerSchema = z.object({ identifier: z.string(), state: z.object({ type: z.string() }) });

const relationSchema = z.object({ type: z.string(), issue: blockerSchema });

const relationsSchema = z.object({ nodes: z.array(relationSchema), pageInfo: z.object({ hasNextPage: z.boolean() }) });

const nodeSchema = z.object({
  identifier: z.string(),
  priority: z.number(),
  createdAt: z.string(),
  project: projectSchema.nullable(),
  labels: z.object({ nodes: z.array(labelSchema) }),
  parent: z.object({ identifier: z.string() }).nullable(),
  inverseRelations: relationsSchema,
});

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

const pageSchema = z.object({ issues: z.object({ nodes: z.array(nodeSchema), pageInfo: pageInfoSchema }) });

export async function readTeamIssues(call: LinearCall, team: string, state: string): Promise<TeamIssue[]> {
  const issues: TeamIssue[] = [];
  let after: string | null = null;
  for (let page = 0; ; page++) {
    if (page === MAX_PAGES) {
      throw new HqError('linear_failed', `more than ${MAX_PAGES * PAGE_SIZE} ${state} issues; hq reads no further`);
    }
    const answer = await call(QUERY, { after, team, state });
    const parsed = pageSchema.safeParse(answer);
    if (!parsed.success) {
      throw new HqError('linear_failed', `Linear's ${state} answer has an unexpected shape: ${parsed.error.issues.at(0)?.path.join('.')}`);
    }
    const nodes = parsed.data.issues.nodes;
    issues.push(...nodes.map((node) => toTeamIssue(node)));
    if (!parsed.data.issues.pageInfo.hasNextPage) {
      break;
    }
    after = parsed.data.issues.pageInfo.endCursor;
  }
  return issues;
}

const BLOCKS = 'blocks';
const SETTLED_STATE = 'completed';

function toTeamIssue(node: z.infer<typeof nodeSchema>): TeamIssue {
  const openBlockers = node.inverseRelations.nodes.filter((relation) => relation.type === BLOCKS && relation.issue.state.type !== SETTLED_STATE).map((relation) => relation.issue.identifier);
  return { issue: toReadyIssue(node), openBlockers, moreRelations: node.inverseRelations.pageInfo.hasNextPage };
}

function toReadyIssue(node: z.infer<typeof nodeSchema>): ReadyIssue {
  return {
    identifier: node.identifier,
    project: node.project?.name ?? null,
    projectLabels: node.project?.labels.nodes.map((label) => label.name) ?? [],
    labels: node.labels.nodes.map((label) => label.name),
    type: pickIssueType(node.labels.nodes),
    priority: node.priority,
    createdAt: node.createdAt,
    parent: node.parent?.identifier ?? null,
  };
}
