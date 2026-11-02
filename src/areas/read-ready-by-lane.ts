import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { READY_BY_LANE } from './ready-by-lane.ts';
import type { LaneReady } from './ready-by-lane.ts';

export function readReadyByLane(db: Database, freshMinutes: number, zeroFreshMinutes = freshMinutes): Record<string, { n: number | null; at: string | null }> {
  const isFresh = (ready: LaneReady) => nowMs - Date.parse(ready.at) <= (ready.n === 0 ? zeroFreshMinutes : freshMinutes) * 60_000;
  const raw = metaJson(db, 'lanes_ready_by_lane', READY_BY_LANE, {});
  const nowMs = now().getTime();
  // oxlint-disable-next-line id-length -- the stored count is keyed n, the key z-delivery's reports use
  return Object.fromEntries(Object.entries(raw).map(([lane, ready]) => [lane, isFresh(ready) ? ready : { n: null, at: ready.at }]));
}
