import type { Database } from 'bun:sqlite';
import { readPRAnswers } from './read-pr-answers.ts';
import type { OwnerAnswer } from './read-pr-answers.ts';

export function readHeadLgtm(db: Database, repo: string, pr: number, head: string): OwnerAnswer | null {
  const answers = readPRAnswers(db, repo, pr);
  const newest = answers?.findLast((answer) => answer.head === head) ?? null;
  return newest?.answer === 'lgtm' ? newest : null;
}
