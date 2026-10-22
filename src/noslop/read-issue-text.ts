import { HqError } from '../errors.ts';
import type { LinearCall } from '../linear/types.ts';

const ISSUE_QUERY = 'query($id: String!) { issue(id: $id) { identifier title description } }';

interface LinearIssueText {
  issue: { identifier: string; title: string; description: string | null } | null;
}

export async function readIssueText(linear: LinearCall, id: string): Promise<string> {
  const data = (await linear(ISSUE_QUERY, { id })) as LinearIssueText;
  if (data.issue === null) {
    throw new HqError('linear_failed', `Linear has no issue ${id}`);
  }
  return `# ${data.issue.identifier}: ${data.issue.title}\n\n${data.issue.description ?? ''}\n`;
}
