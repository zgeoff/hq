import type { Database } from 'bun:sqlite';
import { buildRowSchema } from './db/build-row-schema.ts';
import { runSyncRow } from './db/run-sync-row.ts';
import { kdb } from './kdb.ts';
import { logEvent } from './log-event.ts';
import { loadOpWeek } from './one-password/load-op-week.ts';
import { isQuiet } from './clock/is-quiet.ts';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import type { JobRun } from './morning/types.ts';
import { sydneyUtc } from './morning/sydney-utc.ts';
import { sydney } from './morning/sydney.ts';
import { TZ } from './morning/tz.ts';
import { enqueue } from './outbox/enqueue.ts';
import { roleName } from './roles/role-name.ts';

const JOB = 'weekly-audit';

export function runWeeklyAuditTick(db: Database, actor: string, at: Date = now()): JobRun | null {
  const week = findAuditWeek(at);
  if (at < week.due || at >= week.end || isQuiet(at)) {
    return null;
  }
  return db
    .transaction(() => {
      if (readRun(db, week.key) !== null) {
        return null;
      }
      const detail = at >= week.late ? 'late' : null;
      const late = detail !== null;
      const seq = logEvent(db, 'hq', `job:${JOB}`, 'ran', actor, null, null, { key: week.key, late });
      const target = roleName('owner');
      enqueue(db, seq, target, `${formatAuditText(week, late)}\n\n${loadOpWeek(db, week.from)}`, `job:${JOB}:${week.key}`);
      db.query('INSERT INTO job_runs (job, key, at, result, detail, outbox_key) VALUES (?, ?, ?, ?, ?, ?)').run(JOB, week.key, iso(at), 'queued', detail, `hq-ev${seq}-${target}`);
      return readRun(db, week.key);
    })
    .immediate();
}

interface AuditWeek {
  key: string;
  due: Date;
  late: Date;
  end: Date;
  from: Date;
  to: Date;
}

function findAuditWeek(at: Date): AuditWeek {
  const s = sydney(at);
  return buildAuditWeek(s.y, s.mo, s.d - ((new Date(Date.UTC(s.y, s.mo - 1, s.d)).getUTCDay() + 6) % 7));
}

// `day` may be out of the month's range; the date rolls over.
function buildAuditWeek(y: number, mo: number, day: number): AuditWeek {
  const monday = sydneyUtc(y, mo, day);
  return { key: sydney(monday).date, due: sydneyUtc(y, mo, day, 9, 0), late: sydneyUtc(y, mo, day, 9, 30), end: sydneyUtc(y, mo, day + 1), from: sydneyUtc(y, mo, day - 7), to: monday };
}

const JobRunSchema = buildRowSchema('job_runs');

function readRun(db: Database, key: string): JobRun | null {
  return runSyncRow(db, kdb(db).selectFrom('job_runs').selectAll().where('job', '=', JOB).where('key', '=', key).compile(), JobRunSchema);
}

function formatAuditText(week: AuditWeek, late: boolean): string {
  return `Weekly audit due${late ? ' (late: hq did not run at 09:00)' : ''}. The window is the last 7 days in Sydney time: ${formatSydneyDay(week.from)} 00:00 to ${formatSydneyDay(week.to)} 00:00 (${formatUTCMinute(week.from)} to ${formatUTCMinute(week.to)}).`;
}

function formatSydneyDay(at: Date): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(at);
}

function formatUTCMinute(at: Date): string {
  return `${iso(at).slice(0, 16)}Z`;
}
