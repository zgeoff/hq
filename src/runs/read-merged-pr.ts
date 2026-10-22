import type { Database } from 'bun:sqlite';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { requirePR } from './require-pr.ts';
import type { RunPr } from './types.ts';

// The PR's row when it is already merged, else null.
export function readMergedPR(db: Database, raw: string): RunPr | null {
  const pr = requirePR(db, normalizePrRef(raw).ref);
  return pr.state === 'merged' ? pr : null;
}
