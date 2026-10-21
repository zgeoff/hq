import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';

export const OVERRIDE_SCOPE = 'open-findings';

export interface PROverrideInput {
  repo: string;
  pr: number;
  head: string;
  source: string;
  note: string;
  actor: string;
}

export function recordPROverride(db: Database, input: PROverrideInput): void {
  logEvent(db, 'hq', `pr:${input.repo}#${input.pr}`, 'pr-override', input.actor, null, null, { head: input.head, source: input.source, note: input.note, scope: OVERRIDE_SCOPE });
}
