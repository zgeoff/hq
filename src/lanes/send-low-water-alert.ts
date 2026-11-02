import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { buildFocusKey } from '../focus/build-focus-key.ts';
import { readFocus } from '../focus/read-focus.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { findRoleName } from '../roles/find-role-name.ts';
import { checkLowWater } from './check-low-water.ts';
import { LANES } from './lanes.ts';
import { LOW_WATER_TOPIC } from './lanes-alert-topics.ts';
import { LOW_WATER_SINCE_KEY } from './low-water-since-key.ts';
import { pickLowWaterMoves } from './pick-low-water-moves.ts';
import { PROMOTABLE_FOCUS } from './promotable-focus.ts';
import { PROMOTABLE_FOCUS_KEY } from './promotable-focus-key.ts';
import { PROMOTABLE_TOP, PROMOTABLE_TOP_KEY } from './promotable-top.ts';

interface LowWaterAlert {
  eligible: number;
  free: number;
  held: boolean;
  at: Date;
  actor: string;
}

export function sendLowWaterAlert(db: Database, alert: LowWaterAlert): boolean {
  const since = getMeta(db, LOW_WATER_SINCE_KEY);
  const target = findRoleName('triage');
  const moves = pickLowWaterMoves({
    eligible: alert.eligible,
    free: alert.free,
    promotable: metaJson(db, PROMOTABLE_FOCUS_KEY, PROMOTABLE_FOCUS, null),
    top: metaJson(db, PROMOTABLE_TOP_KEY, PROMOTABLE_TOP, null),
    focus: buildFocusKey(readFocus(db)),
    freshMinutes: LANES.readyFreshMinutes(),
    at: alert.at,
    since,
    alerted: since !== null && probeAlerted(db, `low-water:${since}`),
    held: alert.held,
    target,
  });
  if (moves.episode !== null) {
    const from = since === null ? 'none' : 'open';
    checkLowWater(moves.episode, from);
    setMeta(db, LOW_WATER_SINCE_KEY, moves.since);
  }
  if (moves.message === null || target === null) {
    return false;
  }
  const seq = logEvent(db, 'hq', moves.message.subjectID, 'alerted', alert.actor, null, null, { to: target, eligible: alert.eligible, free: alert.free, mark: moves.mark });
  enqueue(db, seq, target, moves.message.text, LOW_WATER_TOPIC);
  return true;
}

function probeAlerted(db: Database, subjectID: string): boolean {
  return db.query(`SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'alerted'`).get(subjectID) !== null;
}
