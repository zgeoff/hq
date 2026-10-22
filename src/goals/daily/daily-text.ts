// The daily goals check-in (goals rhythm): at 18:00 Sydney the watcher tells z-stu where each of
// the 7 goals stands, today and for the week so far. One job_runs row per Sydney date, as the
// morning reports do (morning.ts), so a missed day shows in hq health.
import type { Database } from 'bun:sqlite';
import { readySummary } from '../../areas/ready-summary.ts';
import { loadCapacityLine as capacityLine } from '../../capacity/load-capacity-line.ts';
import { iso } from '../../clock/iso.ts';
import { now } from '../../clock/now.ts';
import { mondayOf } from '../../kinds/monday-of.ts';
import { LANES } from '../../lanes/lanes.ts';
import { sydneyUtc } from '../../morning/sydney-utc.ts';
import { sydney } from '../../morning/sydney.ts';
import { TZ } from '../../morning/tz.ts';
import { downtime } from '../../probe/downtime.ts';
import { outagesIn } from '../../probe/outages-in.ts';
import { unreadyIn } from '../../probe/unready-in.ts';
import { GOAL_KEYS } from '../goal-keys.ts';
import type { GoalKey } from '../goal-keys.ts';
import { GOAL_NAMES } from '../goal-names.ts';
import { goalTargets } from '../goal-targets.ts';
import { loadCostGoal } from '../load-cost-goal.ts';
import { measure } from '../measure.ts';
import { targetLine } from '../target-line.ts';
import { THROUGHPUT_LINES } from '../throughput/throughput-lines.ts';
import type { ThroughputLine } from '../throughput/types.ts';
import type { Measure } from '../types.ts';
import { verdict } from '../verdict.ts';

const MAX_LINE = 159;

export function dailyText(db: Database, at: Date = now()): string {
  const s = sydney(at);
  const midnight = sydneyUtc(s.y, s.mo, s.d);
  const today = measure(db, midnight, at, at);
  const week = measure(db, mondayOf(at), at, at);
  const { targets } = goalTargets(db);
  const head = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' }).format(at).replace(',', '');
  const mark = { green: '🟢 green', red: '🔴 red', none: '–' };
  const line = (k: GoalKey) => {
    const [t, w] = [today[k], week[k]];
    const target = targetLine(k, targets[k]);
    if (k === 'cost') {
      const goal = loadCostGoal(db, targets[k], at);
      return formatFittedLine(`- ${GOAL_NAMES[k]}: ${goal.text}; ${w.detail}`, `; target ${target} ${mark[goal.verdict]}`);
    }
    const v = mark[verdict(targets[k], w)];
    const part = (m: Measure) => `${m.shown} (${num(m.n)} ${m.unit}${m.missing ? `, ${m.missing} day(s) not fetched` : ''})${m.extra ?? ''}`;
    return formatFittedLine(`- ${GOAL_NAMES[k]}: today ${part(t)}, week so far ${part(w)}`, `; target ${target} ${v}`);
  };
  const throughput = (read: ThroughputLine) => formatFittedLine(`- ${read.name}: ${read.detail}`, `; target ${read.target} ${mark[read.verdict]}`);
  const ready = readySummary(db, LANES.readyFreshMinutes());
  return [`Goals check-in, ${head}:`, ...GOAL_KEYS.map((key) => line(key)), ...THROUGHPUT_LINES.map((read) => throughput(read(db, midnight, at))), ...(ready ? [ready.line] : []), cap(capacityLine(db, at)), cap(`Incidents today: ${incidents(db, midnight, at)}`)].join('\n');
}

function incidents(db: Database, from: Date, at: Date): string {
  const rows = outagesIn(db, from, at).filter((o) => o.started_at >= iso(from));
  const unready = unreadyIn(db, from, at).filter((o) => o.started_at >= iso(from));
  const lines = [
    ...rows.map((o) => {
      const end = o.ended_at ?? iso(at);
      const mins = downtime(db, new Date(o.started_at), new Date(end)).downMinutes;
      return `Nix outage ${hhmm(o.started_at)}–${o.ended_at ? hhmm(o.ended_at) : 'still down'} Sydney, ${mins} min`;
    }),
    ...unready.map((o) => `Nix unready ${hhmm(o.started_at)}–${o.ended_at ? hhmm(o.ended_at) : 'still unready'} (${Math.round((Date.parse(o.ended_at ?? iso(at)) - Date.parse(o.started_at)) / 60_000)} min)`),
  ];
  if (!lines.length) return 'none';
  return lines.slice(0, 3).join('; ') + (lines.length > 3 ? `; ${lines.length - 3} more` : '');
}

// A long line gives up its middle, never the target and colour at the end.
function formatFittedLine(head: string, tail: string): string {
  const room = MAX_LINE - tail.length;
  return `${head.length > room ? `${head.slice(0, room - 1)}…` : head}${tail}`;
}

const cap = (l: string) => (l.length > MAX_LINE ? `${l.slice(0, MAX_LINE - 1)}…` : l);
const num = (x: number) => x.toLocaleString('en-AU');
const hhmm = (t: string) => new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
