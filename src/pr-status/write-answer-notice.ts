import type { Database } from 'bun:sqlite';
import { enqueue } from '../outbox/enqueue.ts';
import { pickAnswerNotice } from './pick-answer-notice.ts';
import type { AnswerNoticeInput } from './pick-answer-notice.ts';
import { recordPRNext } from './record-pr-next.ts';

export function writeAnswerNotice(db: Database, eventSeq: number, input: AnswerNoticeInput): void {
  const notice = pickAnswerNotice(input);
  if (notice === null) {
    return;
  }
  recordPRNext(db, { repo: input.repo, pr: input.pr }, notice.next, input.actor);
  enqueue(db, eventSeq, notice.next, notice.text);
}
