import type { Database } from 'bun:sqlite';
import { readPRAnswers } from './read-pr-answers.ts';
import type { OwnerAnswer } from './read-pr-answers.ts';

export function readOwnerLgtm(db: Database, repo: string, pr: number): OwnerAnswer | null {
  const newest = readPRAnswers(db, repo, pr)?.at(-1) ?? null;
  return newest?.answer === 'lgtm' ? newest : null;
}
