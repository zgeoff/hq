import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { parsePRURL } from '../parse-pr-url.ts';
import type { PRAnswer } from './types.ts';
import { findChatRefusal } from './find-chat-refusal.ts';
import { findCurrentOwnerAnswer } from './find-current-owner-answer.ts';
import { hasPRName } from './has-pr-name.ts';
import { isPlainYes } from './is-plain-yes.ts';
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
export function findAnswerSourceRefusal(db: Database, request: AnswerSourceRequest, probe: OwnerProbe): string | null {
  const [kind = '', ...rest] = request.source.split(':');
  const id = rest.join(':');
  if (kind === 'console') {
    return findConsoleReviewRefusal(db, request, id);
  }
  if (kind === 'call') {
    return findCallAnswerRefusal(db, request, id);
  }
  return findChatRefusal(probe);
}

const ReviewRowSchema = z.object({ seq: z.number(), data: z.string() });

const ReviewDataSchema = z.object({ review: z.string(), facts: z.object({ ref: z.string().nullable() }).optional() });

function findConsoleReviewRefusal(db: Database, request: AnswerSourceRequest, id: string): string | null {
  const row = ReviewRowSchema.nullable().parse(db.query("SELECT seq, data FROM events WHERE subject = 'unblock' AND subject_id = ? AND action = 'console-review' ORDER BY seq DESC LIMIT 1").get(id));
  if (row === null) {
    return `${request.source} names no owner review in the console`;
  }
  const data = ReviewDataSchema.parse(JSON.parse(row.data));
  const named = parsePRURL(data.facts?.ref ?? '');
  if (named === null || `${named.owner}/${named.repo}`.toLowerCase() !== request.ref.slug.toLowerCase() || named.number !== request.ref.pr) {
    return `${request.source} is not the owner's console review of ${request.ref.slug}#${request.ref.pr}`;
  }
  if (data.review !== request.answer) {
    return `the owner's console review ${request.source} is ${data.review}, not ${request.answer}`;
  }
  const stored = db
    .query("SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-answer' AND actor = 'console' AND json_extract(data, '$.source') = ? AND json_extract(data, '$.head') = ? AND seq > ? LIMIT 1")
    .get(`pr:${request.ref.repo}#${request.ref.pr}`, request.source, request.head, row.seq);
  if (stored === null) {
    return `the console stored ${request.source} at no head or another head, not ${request.head.slice(0, 7)}, the head gh gives now`;
  }
  return null;
}

const CallRowSchema = z.object({ title: z.string() });

const AnswerDataSchema = z.object({ answer: z.string(), title: z.string().optional() });

function findCallAnswerRefusal(db: Database, request: AnswerSourceRequest, id: string): string | null {
  const call = CallRowSchema.nullable().parse(db.query("SELECT title FROM asks WHERE id = ? AND kind = 'call'").get(id));
  if (call === null) {
    return `${request.source} is not a call in hq`;
  }
  const answer = findCurrentOwnerAnswer(db, id);
  if (answer === null) {
    return `${request.source} has no owner answer for its current round, in the console or by \`hq call answer\` from the owner's session (z-stu), as atc finds the caller`;
  }
  const data = AnswerDataSchema.parse(JSON.parse(answer.data));
  if (!hasPRName(data.title ?? call.title, request.ref)) {
    return `${request.source} does not name ${request.ref.slug}#${request.ref.pr} in the title the owner answered`;
  }
  if (request.answer === 'lgtm' && !isPlainYes(data.answer)) {
    return `the owner's answer to ${request.source} is not a plain yes: "${data.answer}"`;
  }
  return null;
}
