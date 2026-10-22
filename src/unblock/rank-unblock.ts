import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { getUnblock } from './get-unblock.ts';
import type { UnblockItem } from './types.ts';

export function rankUnblock(db: Database, id: string, rank: number | null, actor: string): UnblockItem {
  return db
    .transaction(() => {
      const prev = getUnblock(db, id);
      if (!prev) throw new HqError('not_found', `no unblock item ${id}`);
      db.query('UPDATE unblocks SET rank=?, updated_at=? WHERE id=?').run(rank, iso(now()), id);
      logEvent(db, 'unblock', id, 'ranked', actor, prev.state, prev.state, { rank });
      return getUnblock(db, id)!;
    })
    .immediate();
}
