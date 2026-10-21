import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { reportLaneReady } from '../areas/report-lane-ready.ts';
import { HqError } from '../errors.ts';
import type { LinearCall } from '../linear/types.ts';
import { classifyReady } from './classify-ready.ts';
import type { LaneRules, ReadyIssue } from './types.ts';

const MAX_PAGES = 20;
const MAX_SKIPPED = 100;

const QUERY = `query($after: String, $team: String!, $state: String!) {
  issues(first: 250, after: $after, filter: { team: { key: { eq: $team } }, state: { name: { eq: $state } } }) {
    nodes { identifier project { name } labels { nodes { name } } parent { identifier } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const labelSchema = z.object({ name: z.string() });

const nodeSchema = z.object({
  identifier: z.string(),
  project: z.object({ name: z.string() }).nullable(),
  labels: z.object({ nodes: z.array(labelSchema) }),
  parent: z.object({ identifier: z.string() }).nullable(),
});

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

const pageSchema = z.object({ issues: z.object({ nodes: z.array(nodeSchema), pageInfo: pageInfoSchema }) });

export type ReadyPageAnswer = z.infer<typeof pageSchema>;

// Reads every Ready issue of the team, page by page, then reports the counts per lane in one write.
// A failure on any page throws before anything is written, so the last counts stay as they were.
export async function readLinearReady(db: Database, call: LinearCall, actor: string, rules: LaneRules): Promise<void> {
  const issues: ReadyIssue[] = [];
  let after: string | null = null;
  for (let page = 0; ; page++) {
    if (page === MAX_PAGES) {
      throw new HqError('linear_failed', `more than ${MAX_PAGES * 250} Ready issues; hq reads no further`);
    }
    const answer = await call(QUERY, { after, team: rules.team, state: rules.readyState });
    const parsed = pageSchema.safeParse(answer);
    if (!parsed.success) {
      throw new HqError('linear_failed', `Linear's Ready answer has an unexpected shape: ${parsed.error.issues.at(0)?.path.join('.')}`);
    }
    for (const node of parsed.data.issues.nodes) {
      issues.push({ identifier: node.identifier, project: node.project?.name ?? null, labels: node.labels.nodes.map((label) => label.name), parent: node.parent?.identifier ?? null });
    }
    if (!parsed.data.issues.pageInfo.hasNextPage) {
      break;
    }
    after = parsed.data.issues.pageInfo.endCursor;
  }
  const classified = classifyReady(issues, rules);
  const skipped = classified.skipped.slice(0, MAX_SKIPPED);

  // The summary counts every Ready issue past the eligible and the listed skipped as unexplained, so
  // the skipped issues cut from the list leave the total too.
  const total = classified.total - (classified.skipped.length - skipped.length);
  reportLaneReady(db, classified.counts, actor, { total, skipped, logOnlyChanges: true });
}
