import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { CI_CHECK_SCOPE } from './ci-check-scope.ts';
import type { PROverrideInput } from './record-pr-override.ts';
import { writeAnswerNotice } from './write-answer-notice.ts';

export interface CICheckOverrideInput extends PROverrideInput {
  check: string;
}

export function recordCICheckOverride(db: Database, input: CICheckOverrideInput): void {
  db.transaction(() => {
    const seq = logEvent(db, 'hq', `pr:${input.repo}#${input.pr}`, 'pr-override', input.actor, null, null, { head: input.head, source: input.source, note: input.note, scope: CI_CHECK_SCOPE, check: input.check });
    writeAnswerNotice(db, seq, { record: { kind: 'ci-override', check: input.check }, repo: input.repo, pr: input.pr, head: input.head, actor: input.actor });
  }).immediate();
}
