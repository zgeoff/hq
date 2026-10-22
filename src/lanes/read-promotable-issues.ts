import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { LinearCall } from '../linear/types.ts';
import { isDescriptionComplete } from './is-description-complete.ts';
import type { PromotableIssue } from './types.ts';

const MAX_PAGES = 20;
const PAGE_SIZE = 50;
const BACKLOG_STATE = 'Backlog';
const PARKED_LABEL = 'parked';

// inverseRelations holds the relations that point at the issue: a `blocks` one names its blocker.
const QUERY = `query($after: String, $team: String!, $state: String!) {
  issues(first: ${PAGE_SIZE}, after: $after, filter: { team: { key: { eq: $team } }, state: { name: { eq: $state } } }) {
    nodes {
      identifier title description
      labels { nodes { name } }
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

const labelSchema = z.object({ name: z.string() });

const labelsSchema = z.object({ nodes: z.array(labelSchema) });

const nodeSchema = z.object({ identifier: z.string(), title: z.string(), description: z.string().nullable(), labels: labelsSchema, inverseRelations: relationsSchema });

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

const issuesSchema = z.object({ nodes: z.array(nodeSchema), pageInfo: pageInfoSchema });

const pageSchema = z.object({ issues: issuesSchema });

// Reads the team's Backlog and keeps the issues triage may promote: every blocker completed, every
// section filled, and no parked label. An issue with more relations than one page shows is left
// out, since hq cannot see all its blockers. Reads only; triage moves the issues.
export async function readPromotableIssues(call: LinearCall, team: string): Promise<PromotableIssue[]> {
  const promotable: PromotableIssue[] = [];
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
      const parked = node.labels.nodes.some((label) => label.name === PARKED_LABEL);
      const blockers = node.inverseRelations.nodes.filter((relation) => relation.type === 'blocks');
      const unblocked = !node.inverseRelations.pageInfo.hasNextPage && blockers.every((relation) => relation.issue.state.type === 'completed');
      if (!parked && unblocked && isDescriptionComplete(node.description)) {
        promotable.push({ identifier: node.identifier, title: node.title });
      }
    }
    if (!parsed.data.issues.pageInfo.hasNextPage) {
      break;
    }
    after = parsed.data.issues.pageInfo.endCursor;
  }
  return promotable;
}
