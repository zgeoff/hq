import type { Database } from 'bun:sqlite';
import { logEvent } from './log-event.ts';
import { iso } from './clock/iso.ts';
import { nextMorning } from './clock/next-morning.ts';
import { now } from './clock/now.ts';
import { parseWhen } from './clock/parse-when.ts';
import { HqError } from './errors.ts';
import type { UnblockItem } from './unblock/types.ts';
import { getUnblock } from './unblock/get-unblock.ts';

// `hq unblock later`: hides an open item from the console until the time, the next 07:00 Sydney by
// default, as `hq call later` does. It stays open, so every list still shows it.
export function setUnblockLater(db: Database, id: string, until: string | null, actor: string): UnblockItem {
  return db
    .transaction(() => {
      const current = requireUnblock(db, id),
        due = buildLaterDue(until);
      if (current.state !== 'open') {
        throw new HqError('bad_state', `${id} is ${current.state}, not open`);
      }
      db.query('UPDATE unblocks SET due_at = ?, updated_at = ? WHERE id = ?').run(due, iso(now()), id);
      logEvent(db, 'unblock', id, 'later', actor, 'open', 'open', { due_at: due });
      return requireUnblock(db, id);
    })
    .immediate();
}

function requireUnblock(db: Database, id: string): UnblockItem {
  const u = getUnblock(db, id);
  if (u === null) {
    throw new HqError('not_found', `no unblock item ${id}`);
  }
  return u;
}

function buildLaterDue(until: string | null): string {
  const when = until === null ? nextMorning(now()) : parseWhen(until, now());
  return iso(when);
}
