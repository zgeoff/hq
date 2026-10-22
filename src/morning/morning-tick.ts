// Morning reports, ready by 08:30 Sydney each day: at 08:15 the watcher tells z-stu the reports are due, with yesterday's and this morning's windows. Each run
// is a job_runs row, so a missed morning shows in hq health.
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { getRun } from './get-run.ts';
import { isPast as past } from './is-past.ts';
import { JOB } from './job.ts';
import { LATE } from './late.ts';
import { morningText } from './morning-text.ts';
import { sydney } from './sydney.ts';
import { TARGET } from './target.ts';
import type { JobRun } from './types.ts';
import { windows } from './windows.ts';

const DUE = { h: 8, m: 15 };

// The watcher's step: once per Sydney day, from 08:15. Check and queue in one write transaction,
// so two watchers can't both send it.
export function morningTick(db: Database, actor: string, at: Date = now()): JobRun | null {
  const s = sydney(at);
  if (!past(s, DUE)) return null;
  return db
    .transaction(() => {
      if (getRun(db, s.date)) return null;
      const late = past(s, LATE);
      const seq = logEvent(db, 'hq', `job:${JOB}`, 'ran', actor, null, null, { key: s.date, late });
      enqueue(db, seq, TARGET, morningText(windows(at), late), `job:${JOB}:${s.date}`); // a topic per day: one day never supersedes another
      const detail = late ? 'late' : null;
      db.query('INSERT INTO job_runs (job, key, at, result, detail, outbox_key) VALUES (?, ?, ?, ?, ?, ?)').run(JOB, s.date, iso(at), 'queued', detail, `hq-ev${seq}`);
      return getRun(db, s.date);
    })
    .immediate();
}
