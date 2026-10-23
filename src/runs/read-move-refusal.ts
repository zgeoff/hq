import type { Database } from 'bun:sqlite';
import { readUnfinishedWork } from './read-unfinished-work.ts';
import { resolveRun } from './resolve-run.ts';

const UNFINISHED_STATES = new Set(['working', 'blocked']);
const PAST_MERGE_STATES = new Set(['merged', 'deploying', 'deploy-held', 'live-check']);

// Why a working or blocked run may not move past its merge yet, or null when it may. --force skips it.
export function readMoveRefusal(db: Database, issue: string, state: string, force: boolean): string | null {
  const run = resolveRun(db, issue);
  if (force || !UNFINISHED_STATES.has(run.state) || !PAST_MERGE_STATES.has(state)) {
    return null;
  }
  const unfinished = readUnfinishedWork(db, run.issue);
  return unfinished === null ? null : `${run.issue} still has ${unfinished}, so its work is not finished: it moves to merged when its last PR merges and its session ends. Pass --force to move it to ${state} now.`;
}
