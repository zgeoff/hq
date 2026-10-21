import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { READY_BY_LANE } from './ready-by-lane.ts';
import type { LaneReady } from './ready-by-lane.ts';

// Fresh counts only (30 min by default); a lane z-delivery hasn't reported is unknown.
// A reported 0 stays fresh longer (zeroFreshMinutes, 3 h by default), so a lane with
// nothing Ready isn't nudged again every half hour.
export function readReadyByLane(db: Database, freshMinutes: number, zeroFreshMinutes = freshMinutes): Record<string, { n: number | null; at: string | null }> {
  const isFresh = (v: LaneReady) => t - Date.parse(v.at) <= (v.n === 0 ? zeroFreshMinutes : freshMinutes) * 60_000,
    raw = metaJson(db, 'lanes_ready_by_lane', READY_BY_LANE, {}),
    t = now().getTime();
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, isFresh(v) ? v : { n: null, at: v.at }]));
}
