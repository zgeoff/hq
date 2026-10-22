import type { Database } from 'bun:sqlite';
import { logEvent } from './log-event.ts';
import { HqError } from './errors.ts';
import { findSubjectLink } from './find-subject-link.ts';
import { enqueue } from './outbox/enqueue.ts';
import { roleName } from './roles/role-name.ts';
import { REVIEW_LABELS } from './review-labels.ts';
import { setUnblockLater } from './set-unblock-later.ts';
import type { UnblockItem } from './unblock/types.ts';
import { closeUnblock } from './unblock/close-unblock.ts';
import { getUnblock } from './unblock/get-unblock.ts';

export type ConsoleReview = 'lgtm' | 'changes' | 'later' | 'reject';

export interface ConsoleReviewInput {
  id: string;
  review: ConsoleReview;
  note: string;
  actor: string;
}

// The owner's answer on a review item, in one write transaction. lgtm and Changes close it done
// (the owner did the review); Reject drops it, so no session hears "carry on" about a PR going away. hq never
// touches the PR: the owner session gets `console answer: review <id>: <answer>` and relays it.
export function recordConsoleReview(db: Database, input: ConsoleReviewInput): UnblockItem {
  return db
    .transaction((): UnblockItem => {
      const answer = formatReviewAnswer(requireReviewInput(db, input)),
        item = applyReview(db, input, answer),
        seq = logEvent(db, 'unblock', item.id, 'console-review', input.actor, null, null, { review: input.review, note: input.note.trim() === '' ? null : input.note, facts: buildReviewFacts(item) });
      enqueue(db, seq, roleName('owner'), `console answer: review ${item.id}: ${answer}`);
      return item;
    })
    .immediate();
}

// The input, once its item has a subject PR, and a Changes answer has a note that says what to change.
function requireReviewInput(db: Database, input: ConsoleReviewInput): ConsoleReviewInput {
  const u = getUnblock(db, input.id);
  if (u === null) {
    throw new HqError('not_found', `no unblock item ${input.id}`);
  }
  if (findSubjectLink(u) === null) {
    throw new HqError('bad_args', `${input.id} is a to-do, not a review: it takes Done, Later or Skip`);
  }
  if (input.review === 'changes' && input.note.trim() === '') {
    throw new HqError('bad_args', `${input.id}: Changes needs a note that says what to change`);
  }
  return input;
}

function formatReviewAnswer(input: ConsoleReviewInput): string {
  const label = REVIEW_LABELS[input.review];
  return input.note.trim() === '' ? label : `${label} | ${input.note}`;
}

function applyReview(db: Database, input: ConsoleReviewInput, text: string): UnblockItem {
  if (input.review === 'later') {
    return setUnblockLater(db, input.id, null, input.actor);
  }
  const state = input.review === 'reject' ? 'dropped' : 'done';
  return closeUnblock(db, input.id, state, text, input.actor);
}

// What the review was about, kept on the answer so a later item under the same id cannot change it.
function buildReviewFacts(item: UnblockItem): { title: string; issues: string[]; session: string; ref: string | null } {
  return { title: item.title ?? item.task, issues: item.unblocks.map((unblock) => unblock.issue), session: item.added_by, ref: findSubjectLink(item)?.url ?? null };
}
