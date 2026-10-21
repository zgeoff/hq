import type { IssueFile } from './create-issue-file.ts';

const ISSUE_FLAG = '--issue-file';

// The noslop arguments that hand it the issue file, if there is one.
export function buildIssueArgs(file: IssueFile): string[] {
  if (file.path === null) {
    return [];
  }
  return [ISSUE_FLAG, file.path];
}
