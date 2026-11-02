import type { IssueFile } from './create-issue-file.ts';

const ISSUE_FLAG = '--issue-file';

export function buildIssueArgs(file: IssueFile): string[] {
  if (file.path === null) {
    return [];
  }
  return [ISSUE_FLAG, file.path];
}
