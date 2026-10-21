import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { LAST_TICK } from './last-tick.ts';
import { STALE_MIN } from './stale-min.ts';
import { STARTED } from './started.ts';
import type { WatcherState } from './types.ts';

export function watcherState(db: Database, at: Date = now()): WatcherState {
  const lastTick = getMeta(db, LAST_TICK);
  const since = lastTick ?? getMeta(db, STARTED);
  if (since === null) return { lastTick, since: null, stale: false, minutes: null }; // never ran: health shows the unit
  const t = Date.parse(since);
  // A time hq can't read, or one in the future, proves nothing: stale until a tick writes a good one.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(since) || !Number.isFinite(t) || t > at.getTime() + 5 * 60_000) return { lastTick, since, stale: true, minutes: null };
  const minutes = Math.floor((at.getTime() - t) / 60_000);
  return { lastTick, since, stale: minutes >= STALE_MIN, minutes };
}
