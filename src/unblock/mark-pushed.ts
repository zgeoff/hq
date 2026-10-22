import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { newSincePush } from './new-since-push.ts';
import { pushedSeq } from './pushed-seq.ts';

// Moves the cursor to `upto`, the cursor value `hq unblock new` returned, so an
// item added between reading the list and pushing it is never marked pushed.
export function markPushed(db: Database, upto: number, actor: string): { cursor: number; covered: number } {
  return db
    .transaction(() => {
      const prev = pushedSeq(db);
      if (upto <= prev) return { cursor: prev, covered: 0 }; // already pushed: nothing to move
      const max = (db.query('SELECT MAX(added_seq) AS m FROM unblocks').get() as { m: number | null }).m ?? 0;
      if (upto > max) throw new HqError('bad_args', `--upto ${upto} is past the newest item (${max})`);
      const covered = newSincePush(db).filter((u) => u.added_seq <= upto).length;
      setMeta(db, 'unblock_pushed_seq', String(upto));
      logEvent(db, 'hq', 'unblock-cursor', 'pushed', actor, null, null, { from: prev, cursor: upto, covered });
      return { cursor: upto, covered };
    })
    .immediate();
}
