import type { Database } from 'bun:sqlite';
import invariant from 'tiny-invariant';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { logEvent } from '../log-event.ts';
import type { WakeEntry } from './types.ts';

export function wakeAdd(db: Database, s: { id: string; name: string }, note: string | null, actor: string): { entry: WakeEntry; result: 'added' | 'updated' | 'noop' } {
  return db
    .transaction(() => {
      const previous = readEntry(db, s.id);
      if (previous && previous.name === s.name && previous.note === note) {
        return { entry: previous, result: 'noop' as const };
      }
      if (previous) {
        db.query('UPDATE wake_list SET name=?, note=? WHERE session_id=?').run(s.name, note, s.id);
      } else {
        db.query('INSERT INTO wake_list (session_id, name, note, added_by, added_at) VALUES (?, ?, ?, ?, ?)').run(s.id, s.name, note, actor, iso(now()));
      }
      const action = previous ? 'wake-updated' : 'wake-added';
      logEvent(db, 'hq', `wake:${s.id}`, action, actor, null, null, { name: s.name, note });
      const entry = readEntry(db, s.id);
      invariant(entry, 'the wake entry just written is readable in the same transaction');
      return { entry, result: previous ? ('updated' as const) : ('added' as const) };
    })
    .immediate();
}

const WakeEntrySchema = buildRowSchema('wake_list');

function readEntry(db: Database, sessionID: string): WakeEntry | null {
  return runSyncRow(db, kdb(db).selectFrom('wake_list').selectAll().where('session_id', '=', sessionID).compile(), WakeEntrySchema);
}
