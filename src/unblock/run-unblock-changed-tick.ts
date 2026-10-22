import type { Database } from 'bun:sqlite';
import { isQuiet } from '../clock/is-quiet.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { newSincePush } from './new-since-push.ts';

const REPEAT_MS = 60 * 60_000,
  TOLD_AT = 'unblock_changed_told_at',
  TOLD_SEQ = 'unblock_changed_told_seq';

// z-triage's "unblock list changed" nudge, from the watcher: outside quiet hours, tell the owner
// when `hq unblock new` lists items. At once for a seq above the one last told, then every 60 min
// while items stay unpushed. A push that moves the cursor past them ends it.
export function runUnblockChangedTick(db: Database, actor: string, at: Date = now()): boolean {
  if (isQuiet(at)) {
    return false;
  }
  return db
    .transaction(() => {
      const last = Date.parse(getMeta(db, TOLD_AT) ?? ''),
        repeat = Number.isNaN(last) || at.getTime() - last >= REPEAT_MS,
        told = Number(getMeta(db, TOLD_SEQ) ?? 0),
        top = newSincePush(db).reduce((m, u) => Math.max(m, u.added_seq), 0);
      if (top === 0 || (top <= told && !repeat)) {
        return false;
      }
      enqueue(db, logEvent(db, 'hq', 'unblock-cursor', 'changed-told', actor, null, null, { top }), owner(), 'unblock list changed', 'unblock-changed');
      setMeta(db, TOLD_SEQ, String(top));
      setMeta(db, TOLD_AT, iso(at));
      return true;
    })
    .immediate();
}
