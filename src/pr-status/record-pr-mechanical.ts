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

export function recordPRMechanical(db: Database, input: PRMechanicalInput): void {
  logEvent(db, 'hq', `pr:${input.repo}#${input.pr}`, 'pr-mechanical', input.actor, null, null, { head: input.head, files: input.files, lines: input.lines });
}
