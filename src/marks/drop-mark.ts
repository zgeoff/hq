import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { countGrantActions } from '../grants/count-grant-actions.ts';
import { logEvent } from '../log-event.ts';
import { getMark } from './get-mark.ts';
import type { Mark } from './mark-kinds.ts';

export function dropMark(db: Database, id: number, actor: string): Mark | null {
  return db
    .transaction(() => {
      const m = getMark(db, id);
      if (!m) return null;
      if (m.grant_name !== null && countGrantActions(db, m.grant_name) > 0) {
        throw new HqError('conflict', `mark ${id} is grant ${m.grant_name}, with actions recorded under it; it stays`);
      }
      db.query('DELETE FROM marks WHERE id = ?').run(id);
      logEvent(db, 'hq', `mark:${id}`, 'mark-dropped', actor, null, null, { ...m });
      return m;
    })
    .immediate();
}
