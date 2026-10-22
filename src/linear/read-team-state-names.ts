import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { LinearCall } from './types.ts';

const QUERY = `query($teamKey: String!) {
  workflowStates(first: 250, filter: { team: { key: { eq: $teamKey } } }) { nodes { name } }
}`;

const stateSchema = z.object({ name: z.string() });

const answerSchema = z.object({ workflowStates: z.object({ nodes: z.array(stateSchema) }) });

export async function readTeamStateNames(call: LinearCall, team: string): Promise<string[]> {
  const answer = await call(QUERY, { teamKey: team });
  const parsed = answerSchema.safeParse(answer);
  if (!parsed.success) {
    throw new HqError('linear_failed', `Linear's workflow states answer has an unexpected shape: ${parsed.error.issues.at(0)?.path.join('.')}`);
  }
  return parsed.data.workflowStates.nodes.map((node) => node.name);
}
