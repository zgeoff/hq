import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { readUnfinishedWork } from './read-unfinished-work.ts';
import { resolveRun } from './resolve-run.ts';

const UNFINISHED_STATES = new Set(['working', 'blocked']);
const PAST_MERGE_STATES = new Set(['merged', 'deploying', 'deploy-held', 'live-check']);

// A working or blocked run moves past its merge only once its work is done, unless --force says so.
export function requireFinishedRun(db: Database, issue: string, state: string, force: boolean): void {
  const run = resolveRun(db, issue);
  if (force || !UNFINISHED_STATES.has(run.state) || !PAST_MERGE_STATES.has(state)) {
    return;
  }
  const unfinished = readUnfinishedWork(db, run.issue);
  if (unfinished !== null) {
    throw new HqError('bad_state', `${run.issue} still has ${unfinished}, so its work is not finished: it moves to merged when its last PR merges and its session ends. Pass --force to move it to ${state} now.`);
  }
}
