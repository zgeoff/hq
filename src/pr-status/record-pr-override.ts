import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { OVERRIDE_SCOPE } from './override-scope.ts';
import { writeAnswerNotice } from './write-answer-notice.ts';

export interface PROverrideInput {
  repo: string;
  pr: number;
  head: string;
  source: string;
  note: string;
  actor: string;
}

export function recordPROverride(db: Database, input: PROverrideInput): void {
  db.transaction(() => {
    const seq = logEvent(db, 'hq', `pr:${input.repo}#${input.pr}`, 'pr-override', input.actor, null, null, { head: input.head, source: input.source, note: input.note, scope: OVERRIDE_SCOPE });
    writeAnswerNotice(db, seq, { record: { kind: 'override' }, repo: input.repo, pr: input.pr, head: input.head, actor: input.actor });
  }).immediate();
}
