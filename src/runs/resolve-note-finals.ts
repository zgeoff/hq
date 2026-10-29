import type { Database } from 'bun:sqlite';
import { collectFinalClaims } from './collect-final-claims.ts';
import { resolveRun } from './resolve-run.ts';
import type { FinalClaim, FinalResolutions } from './types.ts';

export function resolveNoteFinals(db: Database, resolveFinal: (claims: FinalClaim[]) => Promise<FinalResolutions>, key: string, text: string): Promise<FinalResolutions> {
  return resolveFinal(collectFinalClaims(db, resolveRun(db, key).issue, text));
}
