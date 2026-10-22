// The weekly goals review (goals rhythm): Monday 17:00 Sydney the watcher tells z-stu where each of
// the 7 goals stood over the last complete week and the week before, with the usage per account and
// the flags kept during the week. One job_runs row per Monday, as the daily check-in has per day.
import type { Database } from 'bun:sqlite';
import { accountLabels } from '../../accounts/account-labels.ts';
import { accountName } from '../../accounts/account-name.ts';
import { iso } from '../../clock/iso.ts';
import { now } from '../../clock/now.ts';
import { mondayOf } from '../../kinds/monday-of.ts';
import { sydneyUtc } from '../../morning/sydney-utc.ts';
import { sydney } from '../../morning/sydney.ts';
import { TZ } from '../../morning/tz.ts';
import { newsTagged } from '../../news/news-tagged.ts';
import { loadRefusalsSummary as refusalsSummary } from '../../refusals/load-refusals-summary.ts';
import { GOAL_KEYS } from '../goal-keys.ts';
import type { GoalKey } from '../goal-keys.ts';
import { GOAL_NAMES } from '../goal-names.ts';
import { goalTargets } from '../goal-targets.ts';
import { loadCostGoal } from '../load-cost-goal.ts';
import { measure } from '../measure.ts';
import { targetLine } from '../target-line.ts';
import type { Measure, Measures } from '../types.ts';
import { verdict } from '../verdict.ts';
import { JOB } from './job.ts';

const FLAG_TAG = 'weekly-flag';

export function weeklyText(db: Database, at: Date = now()): string {
  const monday = mondayOf(at);
  const [from, prev] = [weeksBefore(monday, 1), weeksBefore(monday, 2)];
  const [week, last]: [Measures, Measures] = [measure(db, from, monday, at), measure(db, prev, from, at)];
  const { targets } = goalTargets(db);
  const labels = accountLabels(db);
  const mark = { green: '🟢 green', red: '🔴 red', none: '–' };
  const rows = GOAL_KEYS.map((k) => {
    const target = targetLine(k, targets[k]);
    if (k === 'cost') {
      const goal = loadCostGoal(db, targets[k], at);
      return `| ${GOAL_NAMES[k]} | ${target} | ${goal.text}; ${costCell(db, from, monday, week[k], labels)} | ${costCell(db, prev, from, last[k], labels)} | ${mark[goal.verdict]} |`;
    }
    return `| ${GOAL_NAMES[k]} | ${target} | ${cell(k, week[k])} | ${cell(k, last[k])} | ${mark[verdict(targets[k], week[k])]} |`;
  });
  const flags = newsTagged(db, FLAG_TAG, flagsSince(db, at)).map((n) => `- ${flat(n.text)} (${n.from_name}, ${fmt(n.added_at, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '')})`);
  return [
    `Goals weekly, week of ${fmt(from, { day: '2-digit', month: 'short' })}:`,
    '',
    '| goal | target | this week | last week | |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    'Flags you kept:',
    ...(flags.length ? flags : ['none']),
    '',
    refusalsSummary(db, from, monday),
    '',
    'Targets live in hq config: hq goals targets; move one with hq goals target <key> <op> <value>.',
  ].join('\n');
}

const num = (x: number) => x.toLocaleString('en-AU');
const fmt = (t: Date | string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hourCycle: 'h23', ...o }).format(new Date(t));

// Sydney midnight of the Monday `weeks` weeks before the one in `monday`.
const weeksBefore = (monday: Date, weeks: number) => {
  const s = sydney(monday);
  return sydneyUtc(s.y, s.mo, s.d - 7 * weeks);
};

// ---------- the cost row ----------

interface AccountWeek {
  account: string;
  peak: number | null;
  five: number | null;
  seven: number | null;
  n: number; // readings in the week
}

// Per account: the week's peak seven-day use, and the latest reading in the week.
function accountWeeks(db: Database, from: Date, to: Date): AccountWeek[] {
  const [f, t] = [iso(from), iso(to)];
  const rows = db.query('SELECT at, account, five_hour, seven_day FROM usage_samples WHERE at >= ? AND at < ? ORDER BY account, at').all(f, t) as { at: string; account: string; five_hour: number | null; seven_day: number | null }[];
  const out = new Map<string, AccountWeek>();
  for (const r of rows) {
    const w = out.get(r.account) ?? { account: r.account, peak: null, five: null, seven: null, n: 0 };
    w.n++;
    if (r.seven_day !== null && (w.peak === null || r.seven_day > w.peak)) w.peak = r.seven_day;
    w.five = r.five_hour;
    w.seven = r.seven_day;
    out.set(r.account, w);
  }
  return [...out.values()];
}

const pc = (x: number | null) => (x === null ? '?' : `${Math.round(x)}%`);

function costCell(db: Database, from: Date, to: Date, m: Measure, labels: Record<string, string>): string {
  const weeks = accountWeeks(db, from, to);
  const ci = m.ci === undefined ? '' : `; CI ${num(m.ci)} min`;
  if (!weeks.length) return `active account only: no readings${ci}`;
  // Legacy 'active' readings stay in a mixed week: dropping them could hide a breach.
  if (weeks.length === 1 && weeks[0]!.account === 'active') {
    const a = weeks[0]!;
    return `active account only: 7-day peak ${pc(a.peak)}, latest 5-hour ${pc(a.five)} and 7-day ${pc(a.seven)} (${num(a.n)} readings)${ci}`;
  }
  return `${weeks.map((w) => `${accountName(labels, w.account)}: 7-day peak ${pc(w.peak)}, latest 5-hour ${pc(w.five)} and 7-day ${pc(w.seven)} (${num(w.n)} readings)`).join('; ')}${ci}`;
}

// ---------- the message ----------

const cell = (k: GoalKey, m: Measure): string => {
  const gap = m.missing ? `, ${m.missing} day(s) not fetched` : '';
  const extra = m.extra ?? '';
  if (m.value === null) return `no data (${num(m.n)} ${m.unit}${gap})${extra}`;
  if (k === 'downtime') return `${m.shown} down, ${m.outages ?? 0} outage(s), slowest caught in ${m.longest ?? 0} min, ${m.blind ?? 0} min blind (${num(m.n)} ${m.unit})`;
  return `${m.shown} of ${num(m.n)} ${m.unit}${gap}${extra}`;
};

const flat = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 240);

// The last weekly run that sent, else 7 days back.
function flagsSince(db: Database, at: Date): string {
  const last = db.query(`SELECT at FROM job_runs WHERE job = ? AND result = 'queued' ORDER BY at DESC LIMIT 1`).get(JOB) as { at: string } | null;
  return last?.at ?? iso(new Date(at.getTime() - 7 * 86_400_000));
}
