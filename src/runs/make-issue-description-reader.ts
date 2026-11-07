import { readBriefIssue } from '../brief/read-brief-issue.ts';
import type { LinearCall } from '../linear/types.ts';

export function makeIssueDescriptionReader(linear: LinearCall): (issue: string) => Promise<string> {
  return async (issue) => {
    const read = await readBriefIssue(linear, issue);
    return read.description;
  };
}
