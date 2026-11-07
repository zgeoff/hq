import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import type { CompiledQuery } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { RULE_REF } from './rule-ref.ts';
import type { ReviewStats, WeekRow } from './types.ts';

const WEEK = 7 * 86_400_000;

const MarkSchema = buildRowSchema('marks');
const FollowupTotalsSchema = z.object({ total: z.number(), backfilled: z.number() });
const FixedTotalsSchema = z.object({ tallied: z.number(), fixed: z.number() });

export function reviewStats(db: Database, at: Date = now()): ReviewStats {
  const mark = runSyncRow(db, kdb(db).selectFrom('marks').selectAll().where('ref', '=', RULE_REF).orderBy('at').limit(1).compile(), MarkSchema);
  if (!mark) return { mark: null, weeks: [], baseline: { followupsPerWeek: 0, backfilled: 0, fixed: 'none' } };
  const m = Date.parse(mark.at);
  const after = Math.max(1, Math.ceil((at.getTime() - m) / WEEK));
  const weeks: WeekRow[] = [];
  for (const k of [-2, -1, ...Array.from({ length: after }, (_, i) => i + 1)]) {
    const lo = m + (k < 0 ? k : k - 1) * WEEK;
    const hi = Math.min(lo + WEEK, Math.max(at.getTime(), m));
    const [from, to] = [iso(new Date(lo)), iso(new Date(hi))];
    const followupQuery = sql`SELECT COUNT(*) AS total, COALESCE(SUM(source = 'linear backfill'), 0) AS backfilled FROM followups WHERE filed_at >= ${from} AND filed_at < ${to}`.compile(kdb(db));
    const fixedQuery = sql`SELECT COUNT(*) AS tallied, COALESCE(SUM(fixed_in_pr), 0) AS fixed FROM run_prs WHERE fixed_in_pr IS NOT NULL AND tally_at >= ${from} AND tally_at < ${to}`.compile(kdb(db));
    const followupTotals = readOnlyRow(db, followupQuery, FollowupTotalsSchema);
    const fixedTotals = readOnlyRow(db, fixedQuery, FixedTotalsSchema);
    const partialDays = hi - lo < WEEK ? Math.round(((hi - lo) / 86_400_000) * 10) / 10 : null;
    weeks.push({ week: k, from, to, partialDays, followups: followupTotals.total, followupsBackfilled: followupTotals.backfilled, fixed: fixedTotals.fixed, tallied: fixedTotals.tallied });
  }
  const before = weeks.filter((w) => w.week < 0);
  const tallied = before.reduce((a, w) => a + w.tallied, 0);
  return {
    mark,
    weeks,
    baseline: {
      followupsPerWeek: before.reduce((a, w) => a + w.followups, 0) / 2,
      backfilled: before.reduce((a, w) => a + w.followupsBackfilled, 0),
      fixed: tallied ? before.reduce((a, w) => a + w.fixed, 0) / 2 : 'none',
    },
  };
}

// An aggregate without GROUP BY returns one row.
function readOnlyRow<Schema extends z.ZodType>(db: Database, query: CompiledQuery, schema: Schema): z.output<Schema> {
  const [row] = runSyncQuery(db, query, schema);
  invariant(row, 'an aggregate without GROUP BY returns one row');
  return row;
}
