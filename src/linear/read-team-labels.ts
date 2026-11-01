import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { LinearCall } from './types.ts';

const QUERY = `query($filter: IssueLabelFilter!, $after: String) {
  issueLabels(first: 250, after: $after, filter: $filter) {
    nodes { name isGroup parent { name } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const parentSchema = z.object({ name: z.string() }).nullable();

const labelSchema = z.object({ name: z.string(), isGroup: z.boolean(), parent: parentSchema });

const pageInfoSchema = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

const answerSchema = z.object({ issueLabels: z.object({ nodes: z.array(labelSchema), pageInfo: pageInfoSchema }) });

export type TeamLabel = z.output<typeof labelSchema>;

// The team's own labels and the workspace's shared ones both reach its issues.
export async function readTeamLabels(call: LinearCall, team: string): Promise<TeamLabel[]> {
  const filter = { or: [{ team: { key: { eq: team } } }, { team: { null: true } }] };
  const labels: TeamLabel[] = [];
  let after: string | null = null;
  for (;;) {
    const answer = await call(QUERY, { filter, after });
    const parsed = answerSchema.safeParse(answer);
    if (!parsed.success) {
      throw new HqError('linear_failed', `Linear's issue labels answer has an unexpected shape: ${parsed.error.issues.at(0)?.path.join('.')}`);
    }
    labels.push(...parsed.data.issueLabels.nodes);
    const page = parsed.data.issueLabels.pageInfo;
    if (!page.hasNextPage || page.endCursor === null) {
      return labels;
    }
    after = page.endCursor;
  }
}
