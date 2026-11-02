import type { Database } from 'bun:sqlite';
import { logEvent } from './log-event.ts';
import { HqError } from './errors.ts';
import { findSubjectLink } from './find-subject-link.ts';
import { enqueue } from './outbox/enqueue.ts';
import { roleName } from './roles/role-name.ts';
import { setUnblockLater } from './set-unblock-later.ts';
import type { UnblockItem } from './unblock/types.ts';
import { closeUnblock } from './unblock/close-unblock.ts';
import { getUnblock } from './unblock/get-unblock.ts';

type ConsoleMark = 'done' | 'later' | 'skip';

export interface ConsoleMarkInput {
  id: string;
  mark: ConsoleMark;
  note: string;
  actor: string;
}

export function recordConsoleMark(db: Database, input: ConsoleMarkInput): UnblockItem {
  return db
    .transaction((): UnblockItem => {
      const note = input.note.trim() === '' ? null : input.note;
      return recordMarkMessage(db, input, note);
    })
    .immediate();
}

function recordMarkMessage(db: Database, input: ConsoleMarkInput, note: string | null): UnblockItem {
  const current = getUnblock(db, input.id);
  if (current !== null && findSubjectLink(current) !== null) {
    throw new HqError('bad_args', `${input.id} is a review: it takes lgtm, Changes, Later or Reject`);
  }
  const item = applyMark(db, input, note);
  const label = MARK_LABELS[input.mark];
  const seq = logEvent(db, 'unblock', item.id, 'console-mark', input.actor, null, null, { mark: input.mark, note });
  const text = note === null ? label : `${label} | ${note}`;
  enqueue(db, seq, roleName('owner'), `console answer: todo ${item.id}: ${text}`);
  return item;
}

const MARK_LABELS: Record<ConsoleMark, string> = { done: 'Done', later: 'Later', skip: 'Skip' };

function applyMark(db: Database, input: ConsoleMarkInput, note: string | null): UnblockItem {
  if (input.mark === 'later') {
    return setUnblockLater(db, input.id, null, input.actor);
  }
  const state = input.mark === 'done' ? 'done' : 'dropped';
  return closeUnblock(db, input.id, state, note, input.actor);
}
