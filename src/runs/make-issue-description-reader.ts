import type { Database } from 'bun:sqlite';
import { readBriefIssue } from '../brief/read-brief-issue.ts';
import { makeAuditedLinearCaller } from '../linear/make-audited-linear-caller.ts';
import type { Runner } from '../runner/types.ts';

export function makeIssueDescriptionReader(db: Database, run: Runner): (issue: string) => Promise<string> {
  const linear = makeAuditedLinearCaller(db, run);
  return async (issue) => {
    const read = await readBriefIssue(linear, issue);
    return read.description;
  };
}
