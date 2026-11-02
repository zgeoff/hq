import type { Database } from 'bun:sqlite';
import { readPRAnswers } from './read-pr-answers.ts';
import type { OwnerAnswer } from './read-pr-answers.ts';

// The owner's lgtm at the head, when it is the newest answer there: from any answer source hq takes
// (console:, or a chat: or call: answer z-stu records with the owner's words). A later changes or
// reject at the head takes it back.
export function readHeadLgtm(db: Database, repo: string, pr: number, head: string): OwnerAnswer | null {
  const answers = readPRAnswers(db, repo, pr);
  const newest = answers?.findLast((answer) => answer.head === head) ?? null;
  return newest?.answer === 'lgtm' ? newest : null;
}
