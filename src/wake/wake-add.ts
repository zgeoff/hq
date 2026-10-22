import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import type { WakeEntry } from './types.ts';

export function wakeAdd(db: Database, s: { id: string; name: string }, note: string | null, actor: string): { entry: WakeEntry; result: 'added' | 'updated' | 'noop' } {
  return db
    .transaction(() => {
      const prev = db.query('SELECT * FROM wake_list WHERE session_id = ?').get(s.id) as WakeEntry | null;
      if (prev && prev.name === s.name && prev.note === note) return { entry: prev, result: 'noop' as const };
      if (prev) db.query('UPDATE wake_list SET name=?, note=? WHERE session_id=?').run(s.name, note, s.id);
      else db.query('INSERT INTO wake_list (session_id, name, note, added_by, added_at) VALUES (?, ?, ?, ?, ?)').run(s.id, s.name, note, actor, iso(now()));
      logEvent(db, 'hq', `wake:${s.id}`, prev ? 'wake-updated' : 'wake-added', actor, null, null, { name: s.name, note });
      return { entry: db.query('SELECT * FROM wake_list WHERE session_id = ?').get(s.id) as WakeEntry, result: prev ? ('updated' as const) : ('added' as const) };
    })
    .immediate();
}
