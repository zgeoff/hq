import type { Database } from 'bun:sqlite';
import { owner } from '../../owner.ts';
import { ghAuthCause } from '../../ghauth/gh-auth-cause.ts';
import { sydney } from '../../morning/sydney.ts';
import { isPast } from '../is-past.ts';
import { getMondayKey } from './get-monday-key.ts';
import { getRun } from './get-run.ts';
import { JOB } from './job.ts';

const LATE = { h: 17, m: 30 }; // hq health flags a Monday with no run after this

// For hq health: after 17:30 on a Monday, that Monday needs a run, and a queued message must not have failed.
export function goalsWeeklyCheck(db: Database, at: Date): { key: string; ok: boolean; line: string } | null {
  const s = sydney(at);
  if (getMondayKey(at) !== s.date || !isPast(s, LATE)) {
    return null;
  }
  const run = getRun(db, s.date);
  // Join on the event, not the target: a forward re-keys the outbox row to another session.
  const seq = Number(/^hq-ev(\d+)-/.exec(run?.outbox_key ?? '')?.[1]);
  const sent = Number.isNaN(seq) ? null : ((db.query('SELECT status FROM outbox WHERE event_seq = ?').get(seq) as { status: string } | null)?.status ?? null);
  const r = run && { ...run, sent };
  if (!r) return { key: `job:${JOB}`, ok: false, line: `goals weekly: no run today (${s.date}); due 17:00 Sydney on Mondays${cause(db)}` };
  if (r.result === 'queued' && r.sent === 'failed') return { key: `job:${JOB}`, ok: false, line: `goals weekly: today's message to ${owner()} failed to send (hq outbox)` };
  return { key: `job:${JOB}`, ok: true, line: `goals weekly: ${r.result} today at ${r.at}` };
}

// A day with no run because GitHub refused hq's calls names that cause.
const cause = (db: Database): string => {
  const c = ghAuthCause(db);
  return c ? `; cause: ${c}` : '';
};
