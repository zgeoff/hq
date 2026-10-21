import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { READY_BY_LANE } from '../areas/ready-by-lane.ts';
import { isQuiet } from '../clock/is-quiet.ts';
import { iso } from '../clock/iso.ts';
import { getMeta } from '../db/get-meta.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { LANES } from './lanes.ts';

const TOLD = 'lanes_ready_stale_told';

// Tells z-stu once per stale spell: free lane slots while the newest Ready report is older than
// readyStaleMinutes. A spell is keyed by that report's time, so a new report ends it. Quiet hours
// hold the alert until the first look after them. With no report at all, nothing is stale yet.
export function checkReadyStale(db: Database, t: Date, freeSlots: number, actor: string): boolean {
  const newest = loadNewestReadyAt(db),
    staleMs = newest === null ? 0 : t.getTime() - Date.parse(newest) - LANES.readyStaleMinutes() * 60_000;
  if (newest === null || staleMs <= 0 || freeSlots === 0 || getMeta(db, TOLD) === newest || isQuiet(t)) {
    return false;
  }
  sendReadyStale(db, { newest, ageMs: t.getTime() - Date.parse(newest), freeSlots, at: t }, actor);
  return true;
}

interface StaleReady {
  newest: string;
  ageMs: number;
  freeSlots: number;
  at: Date;
}

function sendReadyStale(db: Database, r: StaleReady, actor: string): void {
  const hours = Math.floor(r.ageMs / 3_600_000),
    seq = logEvent(db, 'hq', 'lanes', 'ready-stale', actor, null, null, { newest: r.newest, minutes: Math.floor(r.ageMs / 60_000), freeSlots: r.freeSlots, at: iso(r.at) });
  const failure = getMeta(db, 'lanes_ready_linear_error');
  const read = failure === null ? 'hq has not read Ready from Linear since then' : `hq's last read of Ready from Linear failed: ${failure}`;
  enqueue(db, seq, owner(), `Lanes: ${r.freeSlots} slot(s) free, and the newest Ready report is ${hours} h old (${r.newest}). The lanes can't tell how much work waits. ${read}. Until hq reads again, z-delivery reports Ready by hand with hq lanes ready --lane name=n,...`);
  setMeta(db, TOLD, r.newest);
}

// The newest of the total report and the per-lane reports; null when none was ever made.
function loadNewestReadyAt(db: Database): string | null {
  const lanes = Object.values(metaJson(db, 'lanes_ready_by_lane', READY_BY_LANE, {})).map((v) => v.at),
    total = metaJson(db, 'lanes_ready', z.object({ at: z.string() }).nullable(), null),
    values = total ? [total.at, ...lanes] : lanes;
  return values.length > 0 ? values.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null;
}
