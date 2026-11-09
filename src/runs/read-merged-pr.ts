import type { Database } from 'bun:sqlite';
import { normalizePRRef } from './normalize-pr-ref.ts';
import { requirePR } from './require-pr.ts';
import type { RunPR } from './types.ts';

export function readMergedPR(db: Database, raw: string): RunPR | null {
  const pr = requirePR(db, normalizePRRef(raw).ref);
  return pr.state === 'merged' ? pr : null;
}
