import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';

export interface PRMechanicalInput {
  repo: string;
  pr: number;
  head: string;
  files: string[];
  lines: number;
  actor: string;
}

// z-review's record that hq proved the PR's held edits mechanical at this head. It is no owner
// answer: the owner lines of the record and the lgtm read never see it.
export function recordPRMechanical(db: Database, input: PRMechanicalInput): void {
  logEvent(db, 'hq', `pr:${input.repo}#${input.pr}`, 'pr-mechanical', input.actor, null, null, { head: input.head, files: input.files, lines: input.lines });
}
