import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import type { IssueType } from '../linear/issue-types.ts';
import { sydneyUtc } from '../morning/sydney-utc.ts';
import { sydney } from '../morning/sydney.ts';
import { z } from 'zod';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { CountSchema } from '../db/count-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { IN_SCOPE } from '../scope/in-scope.ts';
import { DAY } from './day.ts';
import type { Kind } from './kinds.ts';
import { isIssueType } from './is-issue-type.ts';
import { KINDS } from './kinds.ts';
import { mondayOf } from './monday-of.ts';
import { readFetchedDays } from './read-fetched-days.ts';
import { toUTCDay as utcDay } from './to-utc-day.ts';
import { TYPE_COLS } from './type-cols.ts';
import type { KindWeek } from './types.ts';

const KindCountSchema = CountSchema.extend({ kind: z.enum([...KINDS, 'other']) });
const TypeCountSchema = CountSchema.extend({ type: buildRowSchema('linear_issues').shape.type.nullable() });
const ClosedCountSchema = CountSchema.extend({ state: buildRowSchema('linear_issues').shape.state, type: buildRowSchema('linear_issues').shape.type });

const zeroTypes = () => Object.fromEntries(TYPE_COLS.map((t) => [t, 0])) as Record<IssueType, number>;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export function kindWeeks(db: Database, weeks: number, at: Date = now()): KindWeek[] {
  const have = readFetchedDays(db);
  const today = utcDay(at.getTime());
  const out: KindWeek[] = [];
  let mon = mondayOf(at);
  for (let i = 0; i < weeks; i++) {
    const s = sydney(mon);
    const next = sydneyUtc(s.y, s.mo, s.d + 7);
    const hi = Math.min(next.getTime(), at.getTime());
    const [from, to] = [iso(mon), iso(new Date(hi))];
    const rows = runSyncQuery(
      db,
      kdb(db)
        .selectFrom('merged_prs')
        .select((eb) => ['kind', eb.fn.countAll<number>().as('count')])
        .where('merged_at', '>=', from)
        .where('merged_at', '<', to)
        .where('repo', 'in', IN_SCOPE)
        .groupBy('kind')
        .compile(),
      KindCountSchema,
    );
    const kinds = Object.fromEntries([...KINDS, 'other'].map((k) => [k, 0])) as Record<Kind, number>;
    for (const row of rows) {
      kinds[row.kind] = row.count;
    }
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    let missing = 0;
    for (let t = Date.parse(`${utcDay(mon.getTime())}T00:00:00Z`); t < hi; t += DAY) if (utcDay(t) !== today && !have.has(utcDay(t))) missing++;
    const prTypes = zeroTypes();
    let prUnlinked = 0;
    const prTypeRows = runSyncQuery(
      db,
      kdb(db)
        .selectFrom('merged_prs as p')
        .leftJoin('linear_issues as l', 'l.issue', 'p.issue')
        .select((eb) => ['l.type as type', eb.fn.countAll<number>().as('count')])
        .where('p.merged_at', '>=', from)
        .where('p.merged_at', '<', to)
        .where('p.repo', 'in', IN_SCOPE)
        .groupBy('l.type')
        .compile(),
      TypeCountSchema,
    );
    for (const row of prTypeRows) {
      if (row.type === null) {
        prUnlinked += row.count;
      } else {
        prTypes[isIssueType(row.type) ? row.type : 'none'] += row.count;
      }
    }
    const issues = zeroTypes();
    let canceled = 0;
    const closedRows = runSyncQuery(
      db,
      kdb(db)
        .selectFrom('linear_issues')
        .select((eb) => ['state', 'type', eb.fn.countAll<number>().as('count')])
        .where('state', '!=', 'open')
        .where('closed_at', '>=', from)
        .where('closed_at', '<', to)
        .groupBy(['state', 'type'])
        .compile(),
      ClosedCountSchema,
    );
    for (const row of closedRows) {
      if (row.state === 'canceled') {
        canceled += row.count;
      } else {
        issues[isIssueType(row.type) ? row.type : 'none'] += row.count;
      }
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
