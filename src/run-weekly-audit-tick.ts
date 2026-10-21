// The weekly audit: on Monday from 09:00 Sydney the watcher tells the
// owner the audit is due, with the window, the 7 Sydney days before that Monday. One job_runs row per
// week, keyed by the Monday's date. Only on the Monday: a first run mid-week sends nothing.
import type { Database } from 'bun:sqlite';
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

// Queues the week's message once, in one write transaction, so two watchers can't both send it.
// Null before Monday 09:00, after that Monday, in the quiet hours, or when this week has its run. A
// first tick after 09:30 says it is late.
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
      const detail = at >= week.late ? 'late' : null,
        late = detail !== null,
        seq = logEvent(db, 'hq', `job:${JOB}`, 'ran', actor, null, null, { key: week.key, late }),
        target = roleName('owner');
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

// The Monday on or before the Sydney date of `at`: its date is the key, 09:00 is when it is due, and
// the window runs from the Monday before, 00:00, to this Monday, 00:00.
function findAuditWeek(at: Date): AuditWeek {
  const s = sydney(at);
  return buildAuditWeek(s.y, s.mo, s.d - ((new Date(Date.UTC(s.y, s.mo - 1, s.d)).getUTCDay() + 6) % 7));
}

// `day` may be out of the month's range; sydneyUtc lets the date roll over.
function buildAuditWeek(y: number, mo: number, day: number): AuditWeek {
  const monday = sydneyUtc(y, mo, day);
  return { key: sydney(monday).date, due: sydneyUtc(y, mo, day, 9, 0), late: sydneyUtc(y, mo, day, 9, 30), end: sydneyUtc(y, mo, day + 1), from: sydneyUtc(y, mo, day - 7), to: monday };
}

function readRun(db: Database, key: string): JobRun | null {
  return db.query('SELECT * FROM job_runs WHERE job = ? AND key = ?').get(JOB, key) as JobRun | null;
}

// Late: the first tick came after 09:30, so the watcher missed 09:00.
function formatAuditText(week: AuditWeek, late: boolean): string {
  return `Weekly audit due${late ? ' (late: hq did not run at 09:00)' : ''}. The window is the last 7 days in Sydney time: ${formatSydneyDay(week.from)} 00:00 to ${formatSydneyDay(week.to)} 00:00 (${formatUTCMinute(week.from)} to ${formatUTCMinute(week.to)}).`;
}

function formatSydneyDay(at: Date): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(at);
}

function formatUTCMinute(at: Date): string {
  return `${iso(at).slice(0, 16)}Z`;
}
