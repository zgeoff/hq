import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { LinearCall } from '../linear/types.ts';

const ISSUE_QUERY = 'query($id: String!) { issue(id: $id) { identifier title description } }';

const LinearIssueTextSchema = z.object({ issue: z.object({ identifier: z.string(), title: z.string(), description: z.string().nullable() }).nullable() });

export async function readIssueText(linear: LinearCall, id: string): Promise<string> {
  const response = await linear(ISSUE_QUERY, { id });
  const parsed = LinearIssueTextSchema.safeParse(response);
  if (!parsed.success) {
    throw new HqError('linear_failed', `Linear returned an issue ${id} hq can't read`);
  }
  const data = parsed.data;
  if (data.issue === null) {
    throw new HqError('linear_failed', `Linear has no issue ${id}`);
  }
  return `# ${data.issue.identifier}: ${data.issue.title}\n\n${data.issue.description ?? ''}\n`;
}
