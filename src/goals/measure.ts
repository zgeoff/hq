import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { row as goalRow } from './row.ts';
import { downtime } from '../probe/downtime.ts';
import { IN_SQL } from '../scope/in-sql.ts';
import { readStats } from '../stats/read-stats.ts';
import type { Measure, Measures } from './types.ts';

const UsageSchema = buildRowSchema('usage_samples');

export function measure(db: Database, from: Date, to: Date, at: Date = now()): Measures {
  const [f, t] = [iso(from), iso(new Date(Math.min(to.getTime(), at.getTime())))];
  const unit = 'typed PRs';
  const ty = typeShares(db, f, t);
  const g = goalRow(db, 'window', from.getTime(), to.getTime(), at, { events: [], from: null });

  const d = g.deploys;
  const ok = d?.applied_ok ?? 0;
  const dn = d ? d.applied_ok + d.applied_failed + d.applied_cancelled : 0;
  const side = d ? `${d.held ? `, ${d.held} held` : ''}${d.no_apply ? `, ${d.no_apply} no-apply` : ''}${d.unknown ? `, ${d.unknown} unknown outcome` : ''}${d.unclassified ? `, ${d.unclassified} not yet classified` : ''}` : '';
  const base = share(pct(ok, dn), dn, 'applies', `${Math.round((100 * ok) / (dn || 1))}% (${ok}/${dn} applies)`);
  const deploys: Measure = { ...base, detail: `${base.detail}${side}`, ...(side ? { extra: side } : {}), ...(d?.unclassified ? { unclassified: d.unclassified } : {}), ...(d?.unknown ? { unknown: d.unknown } : {}) };

  const dt = downtime(db, from, new Date(t));
  const seen = dt.samples > 0 && dt.blindMs < Date.parse(t) - from.getTime();
  const downtimeM: Measure = seen
    ? { value: dt.downMinutes, exact: dt.downMs / 60_000, denominator: dt.samples, unit: 'samples', longest: dt.longestDetectMinutes, longestExact: dt.longestDetectMs / 60_000, outages: dt.outages, blind: dt.blindMinutes, shown: `${dt.downMinutes} min`, detail: `${dt.downMinutes} min down in ${dt.outages} outage(s), slowest caught in ${dt.longestDetectMinutes} min, ${dt.blindMinutes} min not seen by the probe` }
    : { value: null, denominator: 0, unit: 'samples', shown: 'no data', detail: dt.samples ? 'no data: the probe saw the window only blind (the PC offline)' : 'no data: the Nix probe has no samples in the window' };

  const flow = readStats(db, { from: f, to: t, gh: null }).flow;
  const mustfix = share(pct(flow.rechecked, flow.reviewed), flow.reviewed, 'reviewed runs', `${flow.rechecked} of ${flow.reviewed} reviewed runs had a must-fix at the first review`);

  const latest = runSyncRow(db, kdb(db).selectFrom('usage_samples').selectAll().orderBy('at', 'desc').limit(1).compile(), UsageSchema);
  const inWin = latest ? readWindow(db, latest.account, f, t) : { readings: 0, peak: null };
  const peak = inWin.peak === null ? null : Math.round(inWin.peak);
  const exactPeak = inWin.peak ?? undefined;
  const now7 = latest?.seven_day == null ? '?' : `${Math.round(latest.seven_day)}%`;
  const now5 = latest?.five_hour == null ? '?' : `${Math.round(latest.five_hour)}%`;
  const cost: Measure = {
    value: peak,
    ...(exactPeak === undefined ? {} : { exact: exactPeak }),
    denominator: inWin.readings,
    ci: g.ci.minutes,
    unit: 'readings',
    shown: peak === null ? 'no data' : `${peak}%`,
    detail: `Claude 7-day ${now7} and 5-hour ${now5} used at last reading (active account only), 7-day peak ${peak === null ? '?' : `${peak}%`}; CI ${num(g.ci.minutes)} min`,
  };

  const prDays = readUnfetchedPRDays(db, from, to, at);
  return {
    bugs: gap(share(pct(ty.bug, ty.typed), ty.typed, unit, `${ty.bug} Bug of ${ty.typed} merged PRs with a typed Linear issue`), prDays),
    features: gap(share(pct(ty.feature, ty.typed), ty.typed, unit, `${ty.feature} Feature or Improvement of ${ty.typed} merged PRs with a typed Linear issue`), prDays),
    deploys: gap(deploys, g.ci.missing),
    downtime: downtimeM,
    ciwaste: gap(share(pct(g.ci.rawWasteMinutes, g.ci.rawMinutes), g.ci.minutes, 'CI min', `${num(g.ci.wasteMinutes)} of ${num(g.ci.minutes)} CI minutes were in failed or cancelled runs`), g.ci.missing),
    mustfix,
    cost,
  };
}

const WindowSchema = z.object({ readings: z.number(), peak: z.number().nullable() });

function readWindow(db: Database, account: string, from: string, to: string): { readings: number; peak: number | null } {
  const [window] = runSyncQuery(db, sql`SELECT COUNT(*) AS readings, MAX(seven_day) AS peak FROM usage_samples WHERE account = ${account} AND at >= ${from} AND at <= ${to}`.compile(kdb(db)), WindowSchema);
  invariant(window, 'an aggregate without GROUP BY returns one row');
  return window;
}

const TypeShareSchema = z.object({ type: z.string().nullable(), count: z.number() });

function typeShares(db: Database, from: string, to: string): { typed: number; bug: number; feature: number } {
  const rows = runSyncQuery(db, sql`SELECT l.type AS type, COUNT(*) AS count FROM merged_prs p LEFT JOIN linear_issues l ON l.issue = p.issue WHERE p.merged_at >= ${from} AND p.merged_at < ${to} AND p.repo IN ${sql.raw(IN_SQL)} GROUP BY 1`.compile(kdb(db)), TypeShareSchema);
  let typed = 0;
  let bug = 0;
  let feature = 0;
  for (const r of rows) {
    if (r.type === null || r.type === 'none') {
      continue;
    }
    typed += r.count;
    if (r.type === 'Bug') {
      bug += r.count;
    }
    if (r.type === 'Feature' || r.type === 'Improvement') {
      feature += r.count;
    }
  }
  return { typed, bug, feature };
}

const gap = (m: Measure, missing: number): Measure => (missing > 0 ? { ...m, missing, detail: `${m.detail}; ${missing} day(s) not fetched yet, so no colour` } : m);

function readUnfetchedPRDays(db: Database, from: Date, to: Date, at: Date): number {
  const end = Math.min(to.getTime(), at.getTime());
  const today = utcDay(at.getTime());
  const has = db.query('SELECT 1 FROM merged_pr_days WHERE day = ?');
  let n = 0;
  for (let t = Date.parse(`${utcDay(from.getTime())}T00:00:00Z`); t < end; t += 86_400_000) {
    const d = utcDay(t);
    if (d !== today && !has.get(d)) n++;
  }
  return n;
}

const num = (x: number) => x.toLocaleString('en-AU');
const utcDay = (t: number) => iso(new Date(t)).slice(0, 10);
const pct = (a: number, b: number) => (b ? (100 * a) / b : null);
const share = (exact: number | null, n: number, unit: string, detail: string): Measure => {
  const value = exact === null ? null : Math.round(exact);
  return { value, ...(exact === null ? {} : { exact }), denominator: n, unit, shown: value === null ? 'no data' : `${value}%`, detail: value === null ? `no data: no ${unit} in the window` : detail };
};
