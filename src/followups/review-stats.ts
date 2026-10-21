import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import type { Mark } from '../marks/mark-kinds.ts';
import { RULE_REF } from './rule-ref.ts';
import type { ReviewStats, WeekRow } from './types.ts';

const WEEK = 7 * 86_400_000;

export function reviewStats(db: Database, at: Date = now()): ReviewStats {
  const mark = db.query('SELECT * FROM marks WHERE ref = ? ORDER BY at LIMIT 1').get(RULE_REF) as Mark | null;
  if (!mark) return { mark: null, weeks: [], baseline: { followupsPerWeek: 0, backfilled: 0, fixed: 'none' } };
  const m = Date.parse(mark.at);
  const after = Math.max(1, Math.ceil((at.getTime() - m) / WEEK));
  const weeks: WeekRow[] = [];
  for (const k of [-2, -1, ...Array.from({ length: after }, (_, i) => i + 1)]) {
    const lo = m + (k < 0 ? k : k - 1) * WEEK;
    const hi = Math.min(lo + WEEK, Math.max(at.getTime(), m));
    const [from, to] = [iso(new Date(lo)), iso(new Date(hi))];
    const f = db.query(`SELECT COUNT(*) AS n, COALESCE(SUM(source = 'linear backfill'), 0) AS b FROM followups WHERE filed_at >= ? AND filed_at < ?`).get(from, to) as { n: number; b: number };
    const x = db.query('SELECT COUNT(*) AS n, COALESCE(SUM(fixed_in_pr), 0) AS fixed FROM run_prs WHERE fixed_in_pr IS NOT NULL AND tally_at >= ? AND tally_at < ?').get(from, to) as { n: number; fixed: number };
    weeks.push({ week: k, from, to, partialDays: hi - lo < WEEK ? Math.round(((hi - lo) / 86_400_000) * 10) / 10 : null, followups: f.n, followupsBackfilled: f.b, fixed: x.fixed, tallied: x.n });
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
