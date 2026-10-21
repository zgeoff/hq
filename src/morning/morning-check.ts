import type { Database } from 'bun:sqlite';
import { isPast as past } from './is-past.ts';
import { JOB } from './job.ts';
import { LATE } from './late.ts';
import { sydney } from './sydney.ts';
import { TARGET } from './target.ts';
import type { JobRun } from './types.ts';

// For hq health: after 08:45 Sydney, today needs a run, and a queued message must not have failed.
export function morningCheck(db: Database, at: Date): { key: string; ok: boolean; line: string } | null {
  const s = sydney(at);
  if (!past(s, LATE)) return null;
  const r = db
    .query(`SELECT j.*, o.status AS sent FROM job_runs j LEFT JOIN outbox o ON o.idem_key = j.outbox_key WHERE j.job = ? AND j.key = ?`)
    .get(JOB, s.date) as (JobRun & { sent: string | null }) | null;
  if (!r) return { key: `job:${JOB}`, ok: false, line: `morning reports: no run today (${s.date}); due 08:15 Sydney` };
  if (r.result === 'queued' && r.sent === 'failed') return { key: `job:${JOB}`, ok: false, line: `morning reports: today's message to ${TARGET} failed to send (hq outbox)` };
  return { key: `job:${JOB}`, ok: true, line: `morning reports: ${r.result} today at ${r.at}` };
}
