import type { Database } from 'bun:sqlite';
import { readOwnerOverrides } from '../pr-status/read-owner-overrides.ts';
import { isFinalAnswered } from './is-final-answered.ts';
import { sameSha } from './same-sha.ts';
import type { RunPr } from './types.ts';

// The owner's override at the FINAL's head stands for its review, which no round could give. A
// FINAL may carry a short sha, and an override the full one.
export function probeFinalAnswered(db: Database, pr: RunPr): boolean {
  const [repo = '', number = ''] = pr.ref.split('#');
  return isFinalAnswered(pr) || readOwnerOverrides(db, repo, Number(number)).some((override) => sameSha(override.head, pr.final_sha));
}
