import type { Database } from 'bun:sqlite';
import { readOwnerOverrides } from './read-owner-overrides.ts';
import type { OwnerOverride } from './read-owner-overrides.ts';
import { readPRAnswers } from './read-pr-answers.ts';
import type { OwnerAnswer } from './read-pr-answers.ts';

export function readOwnerOverride(db: Database, repo: string, pr: number): OwnerOverride | null {
  return pickStandingOverride(readOwnerOverrides(db, repo, pr).at(-1) ?? null, readPRAnswers(db, repo, pr));
}

// An answer list that does not parse cannot show the owner did not take the override back.
function pickStandingOverride(override: OwnerOverride | null, answers: OwnerAnswer[] | null): OwnerOverride | null {
  if (override === null || answers === null) {
    return null;
  }
  const takenBack = answers.some((answer) => answer.seq > override.seq && answer.answer !== 'lgtm');
  return takenBack ? null : override;
}
