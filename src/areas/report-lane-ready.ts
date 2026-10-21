import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { LANES } from '../lanes/lanes.ts';
import { READY_BY_LANE, READY_DETAIL } from './ready-by-lane.ts';
import type { LaneReady } from './ready-by-lane.ts';
import { readReadyByLane } from './read-ready-by-lane.ts';
import type { ReadyDetail, Skipped } from './types.ts';

// A report without --ready-total or --skipped clears the last detail: it described the last report.
// It also sets the total Ready count, the sum of the fresh per-lane counts, so the two never disagree.
export function reportLaneReady(db: Database, counts: Record<string, number>, actor: string, detail: { total?: number | null; skipped?: Skipped[] | null; logOnlyChanges?: boolean } = {}): void {
  db.transaction(() => {
    const previous = metaJson(db, 'lanes_ready_by_lane', READY_BY_LANE, {});
    const at = iso(now());
    const unchanged = detail.logOnlyChanges === true && isSameReport(previous, counts, metaJson(db, 'lanes_ready_detail', READY_DETAIL, null), detail.skipped ?? []);
    for (const [lane, count] of Object.entries(counts)) {
      // oxlint-disable-next-line id-length -- the stored count is keyed n, the key z-delivery's reports use
      previous[lane] = { n: count, at };
    }
    setMeta(db, 'lanes_ready_by_lane', JSON.stringify(previous));
    setMeta(db, 'lanes_ready', JSON.stringify({ count: buildFreshReadyTotal(db), at, by: actor }));
    const has = detail.total != null || !!detail.skipped?.length;
    setMeta(db, 'lanes_ready_detail', has ? JSON.stringify({ at, total: detail.total ?? null, skipped: detail.skipped ?? [] } satisfies ReadyDetail) : null);
    if (unchanged) {
      return;
    }
    logEvent(db, 'hq', 'lanes', 'ready-by-lane', actor, null, null, { ...counts, ...(has ? { total: detail.total ?? null, skipped: detail.skipped ?? [] } : {}) });
  }).immediate();
}

function isSameReport(previous: Record<string, LaneReady>, counts: Record<string, number>, previousDetail: { skipped: Skipped[] } | null, skipped: Skipped[]): boolean {
  // oxlint-disable-next-line id-length -- the stored count is keyed n
  const sameCounts = Object.entries(counts).every(([lane, count]) => previous[lane]?.n === count);
  return sameCounts && JSON.stringify(previousDetail?.skipped ?? []) === JSON.stringify(skipped);
}

function buildFreshReadyTotal(db: Database): number {
  return Object.values(readReadyByLane(db, LANES.readyFreshMinutes(), LANES.readyZeroFreshMinutes())).reduce((a, v) => a + (v.n ?? 0), 0);
}
