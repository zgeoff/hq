import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { READY_BY_LANE } from './ready-by-lane.ts';
import type { LaneReady } from './ready-by-lane.ts';

export function readReadyByLane(db: Database, freshMinutes: number, zeroFreshMinutes = freshMinutes): Record<string, { n: number | null; at: string | null }> {
  const isFresh = (v: LaneReady) => t - Date.parse(v.at) <= (v.n === 0 ? zeroFreshMinutes : freshMinutes) * 60_000;
  const raw = metaJson(db, 'lanes_ready_by_lane', READY_BY_LANE, {});
  const t = now().getTime();
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, isFresh(v) ? v : { n: null, at: v.at }]));
}
