import type { Database } from 'bun:sqlite';
import { accountLabels } from '../../accounts/account-labels.ts';
import { accountName } from '../../accounts/account-name.ts';
import { iso } from '../../clock/iso.ts';
import { buildRowSchema } from '../../db/build-row-schema.ts';
import { runSyncQuery } from '../../db/run-sync-query.ts';
import { runSyncRow } from '../../db/run-sync-row.ts';
import { kdb } from '../../kdb.ts';
import { now } from '../../clock/now.ts';
import { mondayOf } from '../../kinds/monday-of.ts';
import { sydneyUtc } from '../../morning/sydney-utc.ts';
import { sydney } from '../../morning/sydney.ts';
import { TZ } from '../../morning/tz.ts';
import { newsTagged } from '../../news/news-tagged.ts';
import { formatProbeNote } from '../../probe/format-probe-note.ts';
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

const weeksBefore = (monday: Date, weeks: number) => {
  const s = sydney(monday);
  return sydneyUtc(s.y, s.mo, s.d - 7 * weeks);
};

const UsageSchema = buildRowSchema('usage_samples').pick({ at: true, account: true, five_hour: true, seven_day: true });

interface AccountWeek {
  account: string;
  peak: number | null;
  five: number | null;
  seven: number | null;
  readings: number;
}

function accountWeeks(db: Database, from: Date, to: Date): AccountWeek[] {
  const [f, t] = [iso(from), iso(to)];
  const rows = runSyncQuery(db, kdb(db).selectFrom('usage_samples').select(['at', 'account', 'five_hour', 'seven_day']).where('at', '>=', f).where('at', '<', t).orderBy('account').orderBy('at').compile(), UsageSchema);
  const out = new Map<string, AccountWeek>();
  for (const row of rows) {
    const week = out.get(row.account) ?? { account: row.account, peak: null, five: null, seven: null, readings: 0 };
    week.readings++;
    if (row.seven_day !== null && (week.peak === null || row.seven_day > week.peak)) {
      week.peak = row.seven_day;
    }
    week.five = row.five_hour;
    week.seven = row.seven_day;
    out.set(row.account, week);
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
    return `active account only: 7-day peak ${pc(a.peak)}, latest 5-hour ${pc(a.five)} and 7-day ${pc(a.seven)} (${num(a.readings)} readings)${ci}`;
  }
  return `${weeks.map((week) => `${accountName(labels, week.account)}: 7-day peak ${pc(week.peak)}, latest 5-hour ${pc(week.five)} and 7-day ${pc(week.seven)} (${num(week.readings)} readings)`).join('; ')}${ci}`;
}

const cell = (k: GoalKey, m: Measure): string => {
  const gap = m.missing ? `, ${m.missing} day(s) not fetched` : '';
  const extra = m.extra ?? '';
  if (m.value === null) {
    return `no data (${num(m.denominator)} ${m.unit}${gap})${extra}`;
  }
  if (k === 'downtime') {
    return `${m.shown} down, ${m.outages ?? 0} outage(s), slowest caught in ${m.longest ?? 0} min, ${m.blind ?? 0} min blind${m.probeStart ? `, ${formatProbeNote(m.probeStart)}` : ''} (${num(m.denominator)} ${m.unit})`;
  }
  return `${m.shown} of ${num(m.denominator)} ${m.unit}${gap}${extra}`;
};

const flat = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 240);

function flagsSince(db: Database, at: Date): string {
  const last = runSyncRow(db, kdb(db).selectFrom('job_runs').select('at').where('job', '=', JOB).where('result', '=', 'queued').orderBy('at', 'desc').limit(1).compile(), buildRowSchema('job_runs').pick({ at: true }));
  return last?.at ?? iso(new Date(at.getTime() - 7 * 86_400_000));
}
