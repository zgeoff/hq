// The seven goal measures for a window (goals rhythm). Each reads what hq already stores: merged
// PRs and Linear types (kinds.ts), workflow runs (row.ts), the Nix probe (probe.ts), review
// flow (stats.ts) and Claude usage samples (sample-usage.ts). No data is never green.
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { row as goalRow } from './row.ts';
import { downtime } from '../probe/downtime.ts';
import { IN_SQL } from '../scope/in-sql.ts';
import { computeStats } from '../stats/compute-stats.ts';
import type { Measure, Measures } from './types.ts';

interface Usage {
  at: string;
  account: string;
  five_hour: number | null;
  seven_day: number | null;
}

export function measure(db: Database, from: Date, to: Date, at: Date = now()): Measures {
  const [f, t] = [iso(from), iso(new Date(Math.min(to.getTime(), at.getTime())))];
  const unit = 'typed PRs'; // merged PRs whose Linear issue has a type
  const ty = typeShares(db, f, t);
  const g = goalRow(db, 'window', from.getTime(), to.getTime(), at, { events: [], from: null });

  const d = g.deploys;
  const ok = d?.applied_ok ?? 0;
  const dn = d ? d.applied_ok + d.applied_failed + d.applied_cancelled : 0;
  const side = d ? `${d.held ? `, ${d.held} held` : ''}${d.no_apply ? `, ${d.no_apply} no-apply` : ''}${d.unclassified ? `, ${d.unclassified} not yet classified` : ''}` : '';
  const base = share(pct(ok, dn), dn, 'applies', `${Math.round((100 * ok) / (dn || 1))}% (${ok}/${dn} applies)`);
  const deploys: Measure = { ...base, detail: `${base.detail}${side}`, ...(side ? { extra: side } : {}), ...(d?.unclassified ? { unclassified: d.unclassified } : {}) };

  const dt = downtime(db, from, new Date(t));
  // A window the probe saw only blind (the PC offline) holds no reading of Nix: no data, never green.
  const seen = dt.samples > 0 && dt.blindMs < Date.parse(t) - from.getTime();
  const downtimeM: Measure = seen
    ? { value: dt.downMinutes, exact: dt.downMs / 60_000, n: dt.samples, unit: 'samples', longest: dt.longestDetectMinutes, longestExact: dt.longestDetectMs / 60_000, outages: dt.outages, blind: dt.blindMinutes, shown: `${dt.downMinutes} min`, detail: `${dt.downMinutes} min down in ${dt.outages} outage(s), slowest caught in ${dt.longestDetectMinutes} min, ${dt.blindMinutes} min not seen by the probe` }
    : { value: null, n: 0, unit: 'samples', shown: 'no data', detail: dt.samples ? 'no data: the probe saw the window only blind (the PC offline)' : 'no data: the Nix probe has no samples in the window' };

  const s = computeStats(db, { from: f, to: t, gh: null }).flow;
  const mustfix = share(pct(s.rechecked, s.reviewed), s.reviewed, 'reviewed runs', `${s.rechecked} of ${s.reviewed} reviewed runs had a must-fix at the first review`);

  // Cost: baseline only. Claude usage of the account sampled last, over the window; CI minutes.
  const latest = db.query('SELECT * FROM usage_samples ORDER BY at DESC LIMIT 1').get() as Usage | null;
  const inWin = latest ? (db.query('SELECT COUNT(*) AS n, MAX(seven_day) AS peak FROM usage_samples WHERE account = ? AND at >= ? AND at <= ?').get(latest.account, f, t) as { n: number; peak: number | null }) : { n: 0, peak: null };
  const peak = inWin.peak === null ? null : Math.round(inWin.peak);
  const exactPeak = inWin.peak ?? undefined; // targets compare this, never the rounded peak
  const now7 = latest?.seven_day == null ? '?' : `${Math.round(latest.seven_day)}%`;
  const now5 = latest?.five_hour == null ? '?' : `${Math.round(latest.five_hour)}%`;
  const cost: Measure = {
    value: peak,
    ...(exactPeak === undefined ? {} : { exact: exactPeak }),
    n: inWin.n,
    ci: g.ci.minutes,
    unit: 'readings',
    shown: peak === null ? 'no data' : `${peak}%`,
    detail: `Claude 7-day ${now7} and 5-hour ${now5} used at last reading (active account only), 7-day peak ${peak === null ? '?' : `${peak}%`}; CI ${num(g.ci.minutes)} min`,
  };

  // A watcher gap leaves days unfetched: their share is incomplete, so it gets no colour.
  const prDays = unfetchedPrDays(db, from, to, at);
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

function typeShares(db: Database, from: string, to: string): { typed: number; bug: number; feature: number } {
  // The same join and denominator as prBugShare in kindWeeks: merged PRs whose Linear issue has a real type (not NULL, not 'none').
  const rows = db.query(`SELECT l.type AS type, COUNT(*) AS n FROM merged_prs p LEFT JOIN linear_issues l ON l.issue = p.issue WHERE p.merged_at >= ? AND p.merged_at < ? AND p.repo IN ${IN_SQL} GROUP BY 1`).all(from, to) as { type: string | null; n: number }[];
  let typed = 0;
  let bug = 0;
  let feature = 0;
  for (const r of rows) {
    if (r.type === null || r.type === 'none') continue; // 'none': Linear returned no type for the issue
    typed += r.n;
    if (r.type === 'Bug') bug += r.n;
    if (r.type === 'Feature' || r.type === 'Improvement') feature += r.n;
  }
  return { typed, bug, feature };
}

const gap = (m: Measure, missing: number): Measure => (missing > 0 ? { ...m, missing, detail: `${m.detail}; ${missing} day(s) not fetched yet, so no colour` } : m);

// Past UTC days in the window with no merged-PR fetch (today is still open, so it never counts).
function unfetchedPrDays(db: Database, from: Date, to: Date, at: Date): number {
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
  return { value, ...(exact === null ? {} : { exact }), n, unit, shown: value === null ? 'no data' : `${value}%`, detail: value === null ? `no data: no ${unit} in the window` : detail };
};
