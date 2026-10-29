import type { Database } from 'bun:sqlite';
import { collectFinalClaims } from './collect-final-claims.ts';
import { resolveRun } from './resolve-run.ts';
import type { FinalClaim, FinalResolutions } from './types.ts';

// What GitHub says of every FINAL sha a cli note gives, read before the note's transaction opens.
export function resolveNoteFinals(db: Database, resolveFinal: (claims: FinalClaim[]) => Promise<FinalResolutions>, key: string, text: string): Promise<FinalResolutions> {
  return resolveFinal(collectFinalClaims(db, resolveRun(db, key).issue, text));
}
