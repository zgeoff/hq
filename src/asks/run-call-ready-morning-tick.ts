import type { Database } from 'bun:sqlite';
import { getSydneyParts } from '../clock/get-sydney-parts.ts';
import { now } from '../clock/now.ts';
import { quietWindow } from '../clock/quiet-window.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { sydney } from '../morning/sydney.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { nextEligible } from './next-eligible.ts';
import { openItem } from './open-item.ts';

const DATE = 'call_ready_morning_date';

// z-triage's morning nudge, from the watcher: on the first tick at or after the quiet window's end
// (07:00 Sydney) on each Sydney date, tell the owner "call ready" when nothing is open and a call
// waits, as `hq status` shows them. Only that first tick counts: the date is recorded either way.
export function runCallReadyMorningTick(db: Database, actor: string, at: Date = now()): boolean {
  if (getSydneyParts(at).hour < quietWindow().end) {
    return false;
  }
  const date = sydney(at).date;
  return db
    .transaction(() => {
      if (getMeta(db, DATE) === date) {
        return false;
      }
      setMeta(db, DATE, date);
      const call = nextEligible(db, 'call', at);
      if (openItem(db) || !call) {
        return false;
      }
      enqueue(db, logEvent(db, 'ask', call.id, 'call-ready-morning', actor, null, null, { date }), owner(), 'call ready', 'call-ready-morning');
      return true;
    })
    .immediate();
}
