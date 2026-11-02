import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { getMeta } from '../db/get-meta.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { buildFocusKey } from '../focus/build-focus-key.ts';
import { readFocus } from '../focus/read-focus.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { findRoleName } from '../roles/find-role-name.ts';
import { LANES } from './lanes.ts';
import { LOW_WATER_SINCE_KEY } from './low-water-since-key.ts';
import { pickLowWater } from './pick-low-water.ts';
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

// Tells z-triage once per low-water episode that the eligible Ready work is running out while Backlog
// issues wait to be promoted. The episode starts at the first look under the mark with a fresh promotable
// count above 0 and ends when eligible work is back at the mark. A lanes hold stops the message, not the episode.
export function sendLowWaterAlert(db: Database, alert: LowWaterAlert): boolean {
  const focus = buildFocusKey(readFocus(db));
  const promotable = metaJson(db, PROMOTABLE_FOCUS_KEY, PROMOTABLE_FOCUS, null);
  const pick = pickLowWater({ eligible: alert.eligible, free: alert.free, promotable, focus, freshMinutes: LANES.readyFreshMinutes(), at: alert.at });
  if (pick.phase === 'above') {
    setMeta(db, LOW_WATER_SINCE_KEY, null);
    return false;
  }
  if (pick.phase === 'unclear') {
    return false;
  }
  const since = getMeta(db, LOW_WATER_SINCE_KEY) ?? iso(alert.at);
  setMeta(db, LOW_WATER_SINCE_KEY, since);
  const target = findRoleName('triage');
  if (alert.held || target === null) {
    return false;
  }
  const subjectID = `low-water:${since}`;
  if (db.query(`SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'alerted'`).get(subjectID)) {
    return false;
  }
  const top = metaJson(db, PROMOTABLE_TOP_KEY, PROMOTABLE_TOP, null);
  const list = top !== null && top.focus === focus && top.at === promotable?.at && top.issues.length > 0 ? ` Promote now: ${top.issues.map((issue) => `${issue.identifier} ${issue.title}`).join('; ')}.` : '';
  const seq = logEvent(db, 'hq', subjectID, 'alerted', alert.actor, null, null, { to: target, eligible: alert.eligible, free: alert.free, mark: pick.mark });
  enqueue(db, seq, target, `Lanes: ${alert.eligible} eligible Ready for ${alert.free} free slots (mark ${pick.mark}).${list} Run hq lanes promotable for the rest.`, 'lanes-low-water');
  return true;
}
