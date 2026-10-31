import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { LinearCall } from '../linear/types.ts';
import type { BriefIssue } from './types.ts';

const QUERY = 'query($identifier: String!) { issue(id: $identifier) { identifier description labels { nodes { name parent { name } } } } }';

const labelSchema = z.object({ name: z.string(), parent: z.object({ name: z.string() }).nullish() });

const issueSchema = z.object({
  identifier: z.string(),
  description: z.string().nullable(),
  labels: z.object({ nodes: z.array(labelSchema) }),
});

const answerSchema = z.object({ issue: issueSchema.nullable() });

export async function readBriefIssue(linear: LinearCall, identifier: string): Promise<BriefIssue> {
  const answer = await linear(QUERY, { identifier });
  const parsed = answerSchema.safeParse(answer);
  if (!parsed.success) {
    throw new HqError('linear_failed', `Linear's answer for ${identifier} has an unexpected shape: ${parsed.error.issues.at(0)?.path.join('.')}`);
  }
  if (parsed.data.issue === null) {
    throw new HqError('linear_failed', `Linear has no issue ${identifier}`);
  }
  return { identifier: parsed.data.issue.identifier, description: parsed.data.issue.description ?? '', labels: parsed.data.issue.labels.nodes };
}
