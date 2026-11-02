import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { PRAnswer } from './types.ts';
import { findChatRefusal } from './find-chat-refusal.ts';
import { findCurrentOwnerAnswer } from './find-current-owner-answer.ts';
import { judgeCallAnswer } from './judge-call-answer.ts';
import type { CallEvidence } from './judge-call-answer.ts';
import { judgeConsoleReview } from './judge-console-review.ts';
import type { ConsoleReviewEvidence } from './judge-console-review.ts';
import type { PRRef } from './parse-pr-ref.ts';
import type { OwnerProbe } from './read-owner-session.ts';

export interface AnswerSourceRequest {
  ref: PRRef;
  answer: PRAnswer;
  source: string;
  head: string;
}

// An owner answer on a PR is the owner's only when its source shows it: chat: from the owner's own
// session, console: a console review of this PR with this answer that the console stored at this
// head, call: an owner answer to a call that names this PR (a plain Yes for lgtm).
export function readAnswerSourceRefusal(db: Database, request: AnswerSourceRequest, probe: OwnerProbe): string | null {
  const [kind = '', ...rest] = request.source.split(':');
  const id = rest.join(':');
  if (kind === 'console') {
    return judgeConsoleReview(request, readConsoleReview(db, request, id));
  }
  if (kind === 'call') {
    return judgeCallAnswer(request, readCallAnswer(db, id));
  }
  return findChatRefusal(probe);
}

const ReviewRowSchema = z.object({ seq: z.number(), data: z.string() });

const ReviewDataSchema = z.object({ review: z.string(), facts: z.object({ ref: z.string().nullable() }).optional() });

// The owner's latest console review under this id, and whether the console stored it on this PR at
// the head gh gives now.
function readConsoleReview(db: Database, request: AnswerSourceRequest, id: string): ConsoleReviewEvidence | null {
  const row = ReviewRowSchema.nullable().parse(db.query("SELECT seq, data FROM events WHERE subject = 'unblock' AND subject_id = ? AND action = 'console-review' ORDER BY seq DESC LIMIT 1").get(id));
  if (row === null) {
    return null;
  }
  const data = ReviewDataSchema.parse(JSON.parse(row.data));
  const stored = db
    .query("SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-answer' AND actor = 'console' AND json_extract(data, '$.source') = ? AND json_extract(data, '$.head') = ? AND seq > ? LIMIT 1")
    .get(`pr:${request.ref.repo}#${request.ref.pr}`, request.source, request.head, row.seq);
  return { review: data.review, prURL: data.facts?.ref ?? null, storedAtHead: stored !== null };
}

const CallRowSchema = z.object({ title: z.string() });

const AnswerDataSchema = z.object({ answer: z.string(), title: z.string().optional() });

// The call and the owner's answer to its current round, with the title that answer saw.
function readCallAnswer(db: Database, id: string): CallEvidence | null {
  const call = CallRowSchema.nullable().parse(db.query("SELECT title FROM asks WHERE id = ? AND kind = 'call'").get(id));
  if (call === null) {
    return null;
  }
  const answer = findCurrentOwnerAnswer(db, id);
  if (answer === null) {
    return { title: call.title, answer: null };
  }
  const data = AnswerDataSchema.parse(JSON.parse(answer.data));
  return { title: data.title ?? call.title, answer: data.answer };
}
