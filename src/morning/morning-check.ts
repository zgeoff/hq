import type { Database } from 'bun:sqlite';
import { getRun } from './get-run.ts';
import { isPast as past } from './is-past.ts';
import { JOB } from './job.ts';
import { LATE } from './late.ts';
import { readOutboxStatus } from './read-outbox-status.ts';
import { sydney } from './sydney.ts';
import { TARGET } from './target.ts';

// For hq health: after 08:45 Sydney, today needs a run, and a queued message must not have failed.
export function morningCheck(db: Database, at: Date): { key: string; ok: boolean; line: string } | null {
  const s = sydney(at);
  if (!past(s, LATE)) return null;
  const run = getRun(db, s.date);
  if (!run) {
    return { key: `job:${JOB}`, ok: false, line: `morning reports: no run today (${s.date}); due 08:15 Sydney` };
  }
  if (run.result === 'queued' && readOutboxStatus(db, run.outbox_key) === 'failed') {
    return { key: `job:${JOB}`, ok: false, line: `morning reports: today's message to ${TARGET} failed to send (hq outbox)` };
  }
  return { key: `job:${JOB}`, ok: true, line: `morning reports: ${run.result} today at ${run.at}` };
}
