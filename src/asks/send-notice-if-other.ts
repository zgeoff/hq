import type { Database } from 'bun:sqlite';
import { enqueue } from '../outbox/enqueue.ts';
import type { Notice } from './types.ts';

export function sendNoticeIfOther(db: Database, notice: Notice): void {
  if (notice.target && notice.target !== notice.actor) {
    enqueue(db, notice.seq, notice.target, notice.text, notice.topic ?? null);
  }
}
