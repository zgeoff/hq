import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { pickAnswerNotice } from './pick-answer-notice.ts';
import type { AnswerNoticeInput } from './pick-answer-notice.ts';
import { upsertPRStatus } from './upsert-pr-status.ts';

export function writeAnswerNotice(db: Database, eventSeq: number, input: AnswerNoticeInput): void {
  const notice = pickAnswerNotice(input);
  if (notice === null) {
    return;
  }
  upsertPRStatus(db, input.repo, input.pr, { next: notice.next, next_at: iso(now()) });
  logEvent(db, 'hq', `pr:${input.repo}#${input.pr}`, 'pr-next', input.actor, null, null, { next: notice.next });
  enqueue(db, eventSeq, notice.next, notice.text);
}
