import type { Database } from 'bun:sqlite';
import { readPRAnswers } from './read-pr-answers.ts';
import type { OwnerAnswer } from './read-pr-answers.ts';

// Only the owner's own console or call; a chat: source is a session relaying the owner.
const OWNER_SOURCE = /^(?:console|call):\S+$/u;

// The owner's own lgtm at the head, when it is the newest answer there. A later changes or reject
// at the head, from any source, takes it back; an lgtm a session relayed counts for nothing.
export function readHeadLgtm(db: Database, repo: string, pr: number, head: string): OwnerAnswer | null {
  const answers = readPRAnswers(db, repo, pr);
  const newest = answers?.findLast((answer) => answer.head === head && (answer.answer !== 'lgtm' || OWNER_SOURCE.test(answer.source))) ?? null;
  return newest?.answer === 'lgtm' ? newest : null;
}
