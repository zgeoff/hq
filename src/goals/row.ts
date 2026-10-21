import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { IN_SQL } from '../scope/in-sql.ts';
import { DEPLOY } from './deploy.ts';
import { FAILED } from './failed.ts';
import type { readLog } from './read-log.ts';
import { toUTCDay } from './to-utc-day.ts';
import type { GoalRow } from './types.ts';

const DAY = 86_400_000;

export function row(db: Database, label: string, lo: number, hi: number, at: Date, log: ReturnType<typeof readLog>): GoalRow {
  const [from, to] = [iso(new Date(lo)), iso(new Date(Math.min(hi, at.getTime())))];
  const rs = db.query(`SELECT id, repo, path, status, conclusion, attempt, started_at, updated_at FROM ci_runs WHERE created_at >= ? AND created_at < ? AND repo IN ${IN_SQL}`).all(from, to) as { id: number; repo: string; path: string; status: string; conclusion: string | null; attempt: number; started_at: string | null; updated_at: string }[];
  const dep = rs.filter((r) => r.repo === DEPLOY.repo && r.path === DEPLOY.path);
  // A row counts only for the attempt it was read from: a re-run waits to be classified again.
  const outcome = new Map((db.query('SELECT run_id, outcome, attempt FROM deploy_runs').all() as { run_id: number; outcome: string; attempt: number }[]).map((x) => [x.run_id, x]));
  const classified = (r: { id: number; attempt: number }) => outcome.get(r.id)?.attempt === r.attempt;
  const kind = (o: string) => dep.filter((r) => classified(r) && outcome.get(r.id)!.outcome === o).length;
  const depFirst = db.query('SELECT MIN(created_at) AS t FROM ci_runs WHERE repo = ? AND path = ?').get(DEPLOY.repo, DEPLOY.path) as { t: string | null };
  const waste = (r: (typeof rs)[number]) => FAILED.includes(r.conclusion ?? '') || r.conclusion === 'cancelled';
  // Days in the range whose CI isn't fully fetched for every repo in scope that hq has seen.
  const known = (db.query(`SELECT DISTINCT key FROM goal_days WHERE kind = ? AND key IN ${IN_SQL}`).all('ci') as { key: string }[]).length;
  let missing = 0;
  for (let t = Date.parse(`${toUTCDay(lo)}T00:00:00Z`); t < Math.min(hi, at.getTime()); t += DAY) {
    const d = toUTCDay(t);
    if (d === toUTCDay(at.getTime())) {
      continue;
    }
    const n = (db.query(`SELECT COUNT(*) AS n FROM goal_days WHERE kind = ? AND day = ? AND key IN ${IN_SQL}`).get('ci', d) as { n: number }).n;
    if (!known || n < known) missing++;
  }
  const inLog = log.events.filter((e) => e.at >= from && e.at < to);
  return {
    label,
    from,
    to,
    partial: hi > at.getTime(),
    deploys: depFirst.t && to > depFirst.t ? { runs: dep.length, ok: dep.filter((r) => r.conclusion === 'success').length, failed: dep.filter((r) => FAILED.includes(r.conclusion ?? '')).length, cancelled: dep.filter((r) => r.conclusion === 'cancelled').length, running: dep.filter((r) => r.status !== 'completed').length, applied_ok: kind('applied_ok'), applied_failed: kind('applied_failed'), applied_cancelled: kind('cancelled'), held: kind('held'), no_apply: kind('no_apply'), unclassified: dep.filter((r) => r.status === 'completed' && !classified(r)).length } : null,
    log: log.from && to > log.from ? { deploy: inLog.filter((e) => e.kind === 'DEPLOY').length, hold: inLog.filter((e) => e.kind === 'HOLD').length } : null,
    ci: {
      runs: rs.length,
      failed: rs.filter((r) => FAILED.includes(r.conclusion ?? '')).length,
      cancelled: rs.filter((r) => r.conclusion === 'cancelled').length,
      reruns: rs.filter((r) => r.attempt > 1).length,
      minutes: Math.round(rs.reduce((a, r) => a + getRunMinutes(r), 0)),
      wasteMinutes: Math.round(rs.filter((r) => waste(r)).reduce((a, r) => a + getRunMinutes(r), 0)),
      rawMinutes: rs.reduce((a, r) => a + getRunMinutes(r), 0),
      rawWasteMinutes: rs.filter((r) => waste(r)).reduce((a, r) => a + getRunMinutes(r), 0),
      missing,
    },
    merged: (db.query(`SELECT COUNT(*) AS n FROM merged_prs WHERE merged_at >= ? AND merged_at < ? AND repo IN ${IN_SQL}`).get(from, to) as { n: number }).n,
    closedUnmerged: (db.query(`SELECT COUNT(*) AS n FROM closed_prs WHERE closed_at >= ? AND closed_at < ? AND repo IN ${IN_SQL}`).get(from, to) as { n: number }).n,
  };
}

interface RunTimes {
  status: string;
  started_at: string | null;
  updated_at: string;
}

function getRunMinutes(r: RunTimes): number {
  return r.status === 'completed' && r.started_at ? Math.max(0, (Date.parse(r.updated_at) - Date.parse(r.started_at)) / 60_000) : 0;
}
