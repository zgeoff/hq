import type { Database } from 'bun:sqlite';
import { owner } from '../../owner.ts';
import { ghAuthCause } from '../../ghauth/gh-auth-cause.ts';
import { sydney } from '../../morning/sydney.ts';
import { readOutboxStatus } from '../../morning/read-outbox-status.ts';
import { isPast } from '../is-past.ts';
import { getRun } from './get-run.ts';
import { JOB } from './job.ts';

const LATE = { h: 18, m: 30 }; // hq health flags a day with no run after this

// For hq health: after 18:30 Sydney, today needs a run, and a queued message must not have failed.
export function goalsDailyCheck(db: Database, at: Date): { key: string; ok: boolean; line: string } | null {
  const s = sydney(at);
  if (!isPast(s, LATE)) {
    return null;
  }
  const run = getRun(db, s.date);
  if (!run) {
    return { key: `job:${JOB}`, ok: false, line: `goals check-in: no run today (${s.date}); due 18:00 Sydney${cause(db)}` };
  }
  if (run.result === 'queued' && readOutboxStatus(db, run.outbox_key) === 'failed') {
    return { key: `job:${JOB}`, ok: false, line: `goals check-in: today's message to ${owner()} failed to send (hq outbox)` };
  }
  return { key: `job:${JOB}`, ok: true, line: `goals check-in: ${run.result} today at ${run.at}` };
}

// A day with no run because GitHub refused hq's calls names that cause.
const cause = (db: Database): string => {
  const c = ghAuthCause(db);
  return c ? `; cause: ${c}` : '';
};
