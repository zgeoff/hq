import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import type { EXEMPT_RULES } from './exempt-rules.ts';

export interface PRExemptionInput {
  repo: string;
  pr: number;
  head: string;
  rule: (typeof EXEMPT_RULES)[number];
  note: string;
  files: string[];
  actor: string;
}

export function recordPRExemption(db: Database, input: PRExemptionInput): void {
  logEvent(db, 'hq', `pr:${input.repo}#${input.pr}`, 'pr-exempt', input.actor, null, null, { head: input.head, rule: input.rule, note: input.note, files: input.files });
}
