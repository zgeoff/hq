import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import type { IssueType } from '../linear/issue-types.ts';
import { sydneyUtc } from '../morning/sydney-utc.ts';
import { sydney } from '../morning/sydney.ts';
import { IN_SQL } from '../scope/in-sql.ts';
import { DAY } from './day.ts';
import type { Kind } from './kinds.ts';
import { KINDS } from './kinds.ts';
import { mondayOf } from './monday-of.ts';
import { toUTCDay as utcDay } from './to-utc-day.ts';
import { TYPE_COLS } from './type-cols.ts';
import type { KindWeek } from './types.ts';

const zeroTypes = () => Object.fromEntries(TYPE_COLS.map((t) => [t, 0])) as Record<IssueType, number>;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export function kindWeeks(db: Database, weeks: number, at: Date = now()): KindWeek[] {
  const have = new Set((db.query('SELECT day FROM merged_pr_days').all() as { day: string }[]).map((r) => r.day));
  const today = utcDay(at.getTime());
  const out: KindWeek[] = [];
  let mon = mondayOf(at);
  for (let i = 0; i < weeks; i++) {
    const s = sydney(mon);
    const next = sydneyUtc(s.y, s.mo, s.d + 7);
    const hi = Math.min(next.getTime(), at.getTime());
    const [from, to] = [iso(mon), iso(new Date(hi))];
    const rows = db.query(`SELECT kind, COUNT(*) AS n FROM merged_prs WHERE merged_at >= ? AND merged_at < ? AND repo IN ${IN_SQL} GROUP BY kind`).all(from, to) as { kind: Kind; n: number }[];
    const kinds = Object.fromEntries([...KINDS, 'other'].map((k) => [k, 0])) as Record<Kind, number>;
    for (const r of rows) kinds[r.kind] = r.n;
    const total = rows.reduce((a, r) => a + r.n, 0);
    let missing = 0;
    for (let t = Date.parse(`${utcDay(mon.getTime())}T00:00:00Z`); t < hi; t += DAY) if (utcDay(t) !== today && !have.has(utcDay(t))) missing++;
    const prTypes = zeroTypes();
    let prUnlinked = 0;
    for (const r of db.query(`SELECT l.type AS type, COUNT(*) AS n FROM merged_prs p LEFT JOIN linear_issues l ON l.issue = p.issue WHERE p.merged_at >= ? AND p.merged_at < ? AND p.repo IN ${IN_SQL} GROUP BY 1`).all(from, to) as { type: IssueType | null; n: number }[]) {
      if (r.type === null) prUnlinked += r.n;
      else prTypes[Object.hasOwn(prTypes, r.type) ? r.type : 'none'] += r.n;
    }
    const issues = zeroTypes();
    let canceled = 0;
    for (const r of db.query(`SELECT state, type, COUNT(*) AS n FROM linear_issues WHERE state != 'open' AND closed_at >= ? AND closed_at < ? GROUP BY 1, 2`).all(from, to) as { state: string; type: IssueType; n: number }[]) {
      if (r.state === 'canceled') canceled += r.n;
      else issues[Object.hasOwn(issues, r.type) ? r.type : 'none'] += r.n;
    }
    const linked = TYPE_COLS.reduce((a, t) => a + prTypes[t], 0);
    const done = TYPE_COLS.reduce((a, t) => a + issues[t], 0);
    out.push({
      from,
      to,
      partial: next.getTime() > at.getTime(),
      total,
      kinds,
      bugShare: pct(kinds.fix, total),
      missingDays: missing,
      prTypes,
      prUnlinked,
      prBugShare: pct(prTypes.Bug, linked),
      issues,
      canceled,
      issueBugShare: pct(issues.Bug, done),
    });
    mon = sydneyUtc(s.y, s.mo, s.d - 7);
  }
  return out.reverse();
}
