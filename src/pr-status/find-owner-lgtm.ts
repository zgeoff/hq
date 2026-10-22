import type { Database } from 'bun:sqlite';
import { isAnswerSource } from './is-answer-source.ts';
import { readPRAnswers } from './read-pr-answers.ts';
import type { OwnerAnswer } from './read-pr-answers.ts';

export interface OwnerLgtm {
  changes: OwnerAnswer;
  lgtm: OwnerAnswer;
}

// The reviewed head the commits since start from, and the PR's head now.
export interface AnswerEnds {
  reviewed: string;
  head: string;
}

// The owner's `changes` at the reviewed head and `lgtm` at the head now, from the pr-answer events.
export function findOwnerLgtm(db: Database, repo: string, pr: number, ends: AnswerEnds): OwnerLgtm | null {
  const answers = readPRAnswers(db, repo, pr);
  const changes = answers?.findLast((answer) => answer.head === ends.reviewed) ?? null;
  const lgtm = answers?.at(-1) ?? null;
  if (changes === null || lgtm === null || ends.reviewed === ends.head) {
    return null;
  }
  return isOwnerPair(changes, lgtm, ends.head) ? { changes, lgtm } : null;
}

function isOwnerPair(changes: OwnerAnswer, lgtm: OwnerAnswer, head: string): boolean {
  return changes.answer === 'changes' && lgtm.answer === 'lgtm' && lgtm.head === head && isAnswerSource(changes.source) && isAnswerSource(lgtm.source);
}
