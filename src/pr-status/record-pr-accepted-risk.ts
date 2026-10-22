import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';

export interface PRAcceptedRiskInput {
  repo: string;
  pr: number;
  finding: string;
  source: string;
  note: string;
  actor: string;
}

export function recordPRAcceptedRisk(db: Database, input: PRAcceptedRiskInput): void {
  logEvent(db, 'hq', `pr:${input.repo}#${input.pr}`, 'pr-accepted-risk', input.actor, null, null, { finding: input.finding, source: input.source, note: input.note });
}
