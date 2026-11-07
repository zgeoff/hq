import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import invariant from 'tiny-invariant';
import { sql } from 'kysely';
import { iso } from '../clock/iso.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { readCount } from '../db/read-count.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { IN_SQL } from '../scope/in-sql.ts';
import { DEPLOY } from './deploy.ts';
import { FAILED } from './failed.ts';
import type { readLog } from './read-log.ts';
import { toUTCDay } from './to-utc-day.ts';
import type { GoalRow } from './types.ts';

const DAY = 86_400_000;

const RunSchema = buildRowSchema('ci_runs').pick({ id: true, repo: true, path: true, status: true, conclusion: true, attempt: true, started_at: true, updated_at: true });
const OutcomeSchema = buildRowSchema('deploy_runs').pick({ run_id: true, outcome: true, attempt: true });
const FirstSchema = z.object({ earliest: z.string().nullable() });
const KeySchema = buildRowSchema('goal_days').pick({ key: true });

export function row(db: Database, label: string, lo: number, hi: number, at: Date, log: ReturnType<typeof readLog>): GoalRow {
  const [from, to] = [iso(new Date(lo)), iso(new Date(Math.min(hi, at.getTime())))];
  const rs = runSyncQuery(db, sql`SELECT id, repo, path, status, conclusion, attempt, started_at, updated_at FROM ci_runs WHERE created_at >= ${from} AND created_at < ${to} AND repo IN ${sql.raw(IN_SQL)}`.compile(kdb(db)), RunSchema);
  const dep = rs.filter((r) => r.repo === DEPLOY.repo && r.path === DEPLOY.path);
  const outcome = new Map(runSyncQuery(db, kdb(db).selectFrom('deploy_runs').select(['run_id', 'outcome', 'attempt']).compile(), OutcomeSchema).map((x) => [x.run_id, x]));
  const classified = (r: { id: number; attempt: number }) => outcome.get(r.id)?.attempt === r.attempt;
  const kind = (o: string) => dep.filter((r) => classified(r) && outcome.get(r.id)!.outcome === o).length;
  const [depFirst] = runSyncQuery(db, sql`SELECT MIN(created_at) AS earliest FROM ci_runs WHERE repo = ${DEPLOY.repo} AND path = ${DEPLOY.path}`.compile(kdb(db)), FirstSchema);
  invariant(depFirst, 'an aggregate without GROUP BY returns one row');
  const waste = (r: (typeof rs)[number]) => FAILED.includes(r.conclusion ?? '') || r.conclusion === 'cancelled';
  const known = runSyncQuery(db, sql`SELECT DISTINCT key FROM goal_days WHERE kind = ${'ci'} AND key IN ${sql.raw(IN_SQL)}`.compile(kdb(db)), KeySchema).length;
  let missing = 0;
  for (let t = Date.parse(`${toUTCDay(lo)}T00:00:00Z`); t < Math.min(hi, at.getTime()); t += DAY) {
    const d = toUTCDay(t);
    if (d === toUTCDay(at.getTime())) {
      continue;
    }
    const dayCount = readCount(db, sql`SELECT COUNT(*) AS count FROM goal_days WHERE kind = ${'ci'} AND day = ${d} AND key IN ${sql.raw(IN_SQL)}`.compile(kdb(db)));
    if (!known || dayCount < known) {
      missing++;
    }
  }
  const inLog = log.events.filter((e) => e.at >= from && e.at < to);
  return {
    label,
    from,
    to,
    partial: hi > at.getTime(),
    deploys: depFirst.earliest && to > depFirst.earliest ? { runs: dep.length, ok: dep.filter((run) => run.conclusion === 'success').length, failed: dep.filter((run) => FAILED.includes(run.conclusion ?? '')).length, cancelled: dep.filter((run) => run.conclusion === 'cancelled').length, running: dep.filter((run) => run.status !== 'completed').length, applied_ok: kind('applied_ok'), applied_failed: kind('applied_failed'), applied_cancelled: kind('cancelled'), held: kind('held'), no_apply: kind('no_apply'), unknown: kind('unknown'), unclassified: dep.filter((run) => run.status === 'completed' && !classified(run)).length } : null,
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
    merged: readCount(db, sql`SELECT COUNT(*) AS count FROM merged_prs WHERE merged_at >= ${from} AND merged_at < ${to} AND repo IN ${sql.raw(IN_SQL)}`.compile(kdb(db))),
    closedUnmerged: readCount(db, sql`SELECT COUNT(*) AS count FROM closed_prs WHERE closed_at >= ${from} AND closed_at < ${to} AND repo IN ${sql.raw(IN_SQL)}`.compile(kdb(db))),
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
