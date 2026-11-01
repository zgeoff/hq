import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { LinearCall } from './types.ts';

// The team's own labels and the workspace's shared ones both reach its issues.
const QUERY = `query($teamKey: String!) {
  issueLabels(first: 250, filter: { or: [{ team: { key: { eq: $teamKey } } }, { team: { null: true } }] }) {
    nodes { name isGroup parent { name } }
  }
}`;

const labelSchema = z.object({ name: z.string(), isGroup: z.boolean(), parent: z.object({ name: z.string() }).nullable() });

const answerSchema = z.object({ issueLabels: z.object({ nodes: z.array(labelSchema) }) });

export type TeamLabel = z.output<typeof labelSchema>;

export async function readTeamLabels(call: LinearCall, team: string): Promise<TeamLabel[]> {
  const answer = await call(QUERY, { teamKey: team });
  const parsed = answerSchema.safeParse(answer);
  if (!parsed.success) {
    throw new HqError('linear_failed', `Linear's issue labels answer has an unexpected shape: ${parsed.error.issues.at(0)?.path.join('.')}`);
  }
  return parsed.data.issueLabels.nodes;
}
