import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import type { PRAnswer } from './types.ts';
import { upsertPRStatus } from './upsert-pr-status.ts';

export interface PRAnswerInput {
  repo: string;
  pr: number;
  answer: PRAnswer;
  head: string | null;
  source: string;
  note: string | null;
  actor: string;
}

// Stores the owner's answer at the head given and logs the write, in one transaction. The head is
// null only when it could not be read; the record then shows `head unknown`.
export function recordPRAnswer(db: Database, input: PRAnswerInput): void {
  const at = iso(now());
  db.transaction(() => {
    upsertPRStatus(db, input.repo, input.pr, {
      ...(input.head === null ? {} : { head: input.head }),
      answer: input.answer,
      answer_head: input.head,
      answer_source: input.source,
      answer_note: input.note,
      answer_at: at,
    });
    logEvent(db, 'hq', `pr:${input.repo}#${input.pr}`, 'pr-answer', input.actor, null, null, { answer: input.answer, head: input.head, source: input.source, note: input.note });
  }).immediate();
}
