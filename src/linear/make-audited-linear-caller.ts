import type { Database } from 'bun:sqlite';
import { recordOpRead } from '../one-password/record-op-read.ts';
import type { Runner } from '../runner/types.ts';
import { makeLinearCaller } from './make-linear-caller.ts';
import type { LinearCall } from './types.ts';

export function makeAuditedLinearCaller(db: Database, run: Runner): LinearCall {
  return makeLinearCaller(run, () => recordOpRead(db, 'linear', 3));
}
