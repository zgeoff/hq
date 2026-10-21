import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import type { RunPr } from './types.ts';

export function requirePR(db: Database, ref: string): RunPr {
  const p = db.query('SELECT * FROM run_prs WHERE ref = ?').get(ref) as RunPr | null;
  if (!p) throw new HqError('not_found', `no PR ${ref} on any run: hq run pr <issue> ${ref}`);
  return p;
}
