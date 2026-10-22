import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { watcherState } from './watcher-state.ts';

const ALERTED = 'watcher_stale_alerted';

// From `hq fleet ensure` (its own timer): tell z-stu once per stale spell, and once when it ends.
export function watcherAlert(db: Database, actor: string, at: Date = now()): 'alerted' | 'recovered' | null {
  const s = watcherState(db, at);
  return db
    .transaction(() => {
      const alerted = getMeta(db, ALERTED);
      if (s.stale && alerted !== s.since) {
        const text = `hq watcher: ${s.minutes === null ? `its last tick time is unreadable (${String(s.since).slice(0, 40)})` : `no completed tick for ${s.minutes} min (last ${s.lastTick ?? `none since it started at ${s.since}`})`}. Lane nudges, the sweep, morning reports and sends from the watcher are stopped. Check: systemctl --user status hq-lanes; journalctl --user -u hq-lanes -n 50. A restart: systemctl --user restart hq-lanes.`;
        const seq = logEvent(db, 'hq', 'watcher', 'stale', actor, null, null, { since: s.since, minutes: s.minutes });
        enqueue(db, seq, owner(), text, 'watcher-stale');
        setMeta(db, ALERTED, s.since);
        return 'alerted' as const;
      }
      if (!s.stale && alerted) {
        const seq = logEvent(db, 'hq', 'watcher', 'recovered', actor, null, null, { lastTick: s.lastTick });
        enqueue(db, seq, owner(), `hq watcher: ticking again (last tick ${s.lastTick}).`, 'watcher-stale');
        setMeta(db, ALERTED, null);
        return 'recovered' as const;
      }
      return null;
    })
    .immediate();
}
