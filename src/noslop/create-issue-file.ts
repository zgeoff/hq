import { writeFileSync } from 'node:fs';
import type { LinearCall } from '../linear/types.ts';
import { redact } from '../linear/redact.ts';
import type { Runner } from '../runner/types.ts';
import { checkIssueFlag } from './check-issue-flag.ts';
import { findLinkedIssue } from './find-linked-issue.ts';
import { readIssueText } from './read-issue-text.ts';
import { removeIssueFile } from './remove-issue-file.ts';

export interface IssueNote {
  issue: string | null;
  attached: boolean;
  why: string;
}

export interface IssueFile {
  path: string | null;
  note: IssueNote;
}

export interface IssueFileRequest {
  run: Runner;
  linear: LinearCall;
  clone: string;
  cwd: string;
  body: string;
  path: string;
}

const ISSUE_FLAG = '--issue-file';

// Writes the linked issue to the file for noslop, or says why there is none. It never throws: the
// review runs without the issue rather than not at all.
export async function createIssueFile(request: IssueFileRequest): Promise<IssueFile> {
  const issue = findLinkedIssue(request.body);
  if (issue === null) {
    return buildSkip(null, 'the PR body links no GEO issue');
  }
  try {
    if (!(await checkIssueFlag(request.run, request.clone, request.cwd))) {
      return buildSkip(issue, `the pinned noslop has no ${ISSUE_FLAG}`);
    }
  } catch (error) {
    return buildSkip(issue, `could not ask noslop for its flags: ${toMessage(error)}`);
  }
  return await writeIssueFile(request, issue);
}

async function writeIssueFile(request: IssueFileRequest, issue: string): Promise<IssueFile> {
  try {
    const text = await readIssueText(request.linear, issue);
    writeFileSync(request.path, text, { mode: 0o600 });
    return { path: request.path, note: { issue, attached: true, why: 'attached' } };
  } catch (error) {
    removeIssueFile(request.path);
    return buildSkip(issue, `could not read it from Linear: ${toMessage(error)}`);
  }
}

function buildSkip(issue: string | null, why: string): IssueFile {
  return { path: null, note: { issue, attached: false, why } };
}

function toMessage(error: unknown): string {
  return redact(String((error as Error).message), null).slice(0, 200);
}
