import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { buildFixesOnlyRefusalKey } from './build-fixes-only-refusal-key.ts';

export interface FixesOnlyRefusal {
  // The full sha of the PR head the refused run was asked to check.
  head: string;

  // noslop's words for the refusal.
  why: string;
}

// Keeps noslop's refusal of a --fixes-only run on the PR, so the gate does not point back to
// --fixes-only on that head; null removes it.
export function writeFixesOnlyRefusal(db: Database, repo: string, pr: number, refusal: FixesOnlyRefusal | null): void {
  const value = refusal === null ? null : JSON.stringify({ head: refusal.head, why: refusal.why, at: iso(now()) });
  setMeta(db, buildFixesOnlyRefusalKey(repo, pr), value);
}
