import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { LinearCall } from '../linear/types.ts';
import { NEEDS_DESIGN_LABEL } from './needs-design-label.ts';
import { isIssuePromotable } from './is-issue-promotable.ts';
import { pickIssueType } from './pick-issue-type.ts';
import type { PromotableIssue, ReadyIssue } from './types.ts';

const MAX_PAGES = 20;
const PAGE_SIZE = 50;
const BACKLOG_STATE = 'Backlog';
const WITH_GEOFF_LABEL = 'with-geoff';

// inverseRelations holds the relations that point at the issue: a `blocks` one names its blocker.
const QUERY = `query($after: String, $team: String!, $state: String!) {
  issues(first: ${PAGE_SIZE}, after: $after, filter: { team: { key: { eq: $team } }, state: { name: { eq: $state } } }) {
    nodes {
      identifier title description priority createdAt
      project { name labels { nodes { name } } }
      parent { identifier }
      labels { nodes { name parent { name } } }
      inverseRelations(first: 50) { nodes { type issue { identifier state { type } } } pageInfo { hasNextPage } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const stateSchema = z.object({ type: z.string() });

const blockerSchema = z.object({ identifier: z.string(), state: stateSchema });

const relationSchema = z.object({ type: z.string(), issue: blockerSchema });

const relationPageInfoSchema = z.object({ hasNextPage: z.boolean() });

const relationsSchema = z.object({ nodes: z.array(relationSchema), pageInfo: relationPageInfoSchema });

const nameSchema = z.object({ name: z.string() });

const labelSchema = z.object({ name: z.string(), parent: nameSchema.nullish() });

const projectSchema = z.object({ name: z.string(), labels: z.object({ nodes: z.array(nameSchema) }) });

const labelsSchema = z.object({ nodes: z.array(labelSchema) });

const nodeSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priority: z.number(),
  createdAt: z.string(),
  project: projectSchema.nullable(),
  parent: z.object({ identifier: z.string() }).nullable(),
  labels: labelsSchema,
  inverseRelations: relationsSchema,
});

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

const issuesSchema = z.object({ nodes: z.array(nodeSchema), pageInfo: pageInfoSchema });

const pageSchema = z.object({ issues: issuesSchema });

export interface BacklogIssues {
  promotable: PromotableIssue[];

  // The needs-design issues by the design queue they wait in; none of them is promotable.
  design: { agent: ReadyIssue[]; withGeoff: ReadyIssue[] };
}

// Reads the team's Backlog page by page and sorts it: the issues isIssuePromotable passes, each with the
// facts the focus matches on, and the needs-design issues, queued for the with-geoff lane when they also
// carry the with-geoff label and for the agent lanes otherwise. Reads only; triage moves the issues.
export async function readBacklogIssues(call: LinearCall, team: string): Promise<BacklogIssues> {
  const backlog: BacklogIssues = { promotable: [], design: { agent: [], withGeoff: [] } };
  let after: string | null = null;
  for (let page = 0; ; page++) {
    if (page === MAX_PAGES) {
      throw new HqError('linear_failed', `more than ${MAX_PAGES * PAGE_SIZE} Backlog issues; hq reads no further`);
    }
    const answer = await call(QUERY, { after, team, state: BACKLOG_STATE });
    const parsed = pageSchema.safeParse(answer);
    if (!parsed.success) {
      throw new HqError('linear_failed', `Linear's Backlog answer has an unexpected shape: ${parsed.error.issues.at(0)?.path.join('.')}`);
    }
    for (const node of parsed.data.issues.nodes) {
      const blockers = node.inverseRelations.nodes.filter((relation) => relation.type === 'blocks');
      const issue = {
        description: node.description,
        labels: node.labels.nodes.map((label) => label.name),
        blockerStates: blockers.map((relation) => relation.issue.state.type),
        moreRelations: node.inverseRelations.pageInfo.hasNextPage,
      };
      const facts = {
        identifier: node.identifier,
        project: node.project?.name ?? null,
        projectLabels: node.project?.labels.nodes.map((label) => label.name) ?? [],
        labels: issue.labels,
        type: pickIssueType(node.labels.nodes),
        priority: node.priority,
        createdAt: node.createdAt,
        parent: node.parent?.identifier ?? null,
      };
      if (issue.labels.includes(NEEDS_DESIGN_LABEL)) {
        (issue.labels.includes(WITH_GEOFF_LABEL) ? backlog.design.withGeoff : backlog.design.agent).push(facts);
      } else if (isIssuePromotable(issue)) {
        backlog.promotable.push({ identifier: node.identifier, title: node.title, facts });
      }
    }
    if (!parsed.data.issues.pageInfo.hasNextPage) {
      break;
    }
    after = parsed.data.issues.pageInfo.endCursor;
  }
  return backlog;
}
