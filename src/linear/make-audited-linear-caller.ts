import type { Database } from 'bun:sqlite';
import { recordOpRead } from '../one-password/record-op-read.ts';
import type { Runner } from '../runner/types.ts';
import { makeLinearCaller } from './make-linear-caller.ts';
import type { LinearCall } from './types.ts';

// The Linear caller hq's commands use: each real 1Password read of the key, by name, costs 3
// requests and records one op read event for the weekly audit.
export function makeAuditedLinearCaller(db: Database, run: Runner): LinearCall {
  return makeLinearCaller(run, fetch, () => recordOpRead(db, 'linear', 3));
}
