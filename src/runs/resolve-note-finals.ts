import type { Database } from 'bun:sqlite';
import { findNoteSession } from './find-note-session.ts';
import { readFinalClaims } from './read-final-claims.ts';
import { resolveRun } from './resolve-run.ts';
import type { FinalClaim, FinalResolutions } from './types.ts';

export function resolveNoteFinals(db: Database, resolveFinal: (claims: FinalClaim[]) => Promise<FinalResolutions>, key: string, text: string): Promise<FinalResolutions> {
  const issue = resolveRun(db, key, 'allow').issue;
  const claims = findNoteSession(db, issue, key)?.design_pass === 1 ? [] : readFinalClaims(db, issue, text);
  return resolveFinal(claims);
}
