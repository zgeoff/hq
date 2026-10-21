import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { CLOSED_RUN_STATES as CLOSED } from '../transitions/closed-run-states.ts';
import { requireRun as mustRun } from './require-run.ts';
import type { Run } from './types.ts';

export function requireOpenRun(db: Database, issue: string): Run {
  const r = mustRun(db, issue);
  if (CLOSED.includes(r.state)) throw new HqError('bad_state', `${issue} is ${r.state}`);
  return r;
}
