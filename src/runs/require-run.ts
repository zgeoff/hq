import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { getRun } from './get-run.ts';
import type { Run } from './types.ts';

export function requireRun(db: Database, issue: string): Run {
  const r = getRun(db, issue);
  if (!r) throw new HqError('not_found', `no run for ${issue}`);
  return r;
}
