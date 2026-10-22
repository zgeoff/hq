import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { getDeclaredForwards as declaredForwards } from '../roles/get-declared-forwards.ts';
import { forwardOf } from './forward-of.ts';
import { forwards } from './forwards.ts';
import { loadForwards as metaForwards } from './load-forwards.ts';

// Set (or with to = null, clear) a forward, and move the unsent messages already queued for `from`.
export function setForward(db: Database, from: string, to: string | null): { moved: number; merged: number } {
  return db
    .transaction(() => {
      const stored = metaForwards(db);
      const map = forwards(db);
      if (to === null) {
        // A forward declared in fleet.json is not hq's to drop: deleting a meta row would leave it in force.
        if (!(from in stored) && from in declaredForwards()) throw new HqError('bad_args', `${from}'s forward is declared in fleet.json; change it there`);
        delete stored[from];
        // Removing a stored override brings back a declared forward, which can close a loop with
        // the stored ones (Codex, on hq#108).
        const after = { ...declaredForwards(), ...stored };
        if (after[from]) {
          const seen = new Set<string>([from]);
          for (let t: string | undefined = after[from]; t; t = after[t]) {
            if (seen.has(t)) throw new HqError('bad_args', `removing ${from}'s forward brings back fleet.json's ${from} → ${after[from]}, which makes a loop; remove the other forward first`);
            seen.add(t);
          }
        }
      } else {
        if (from === to) throw new HqError('bad_args', 'a session cannot forward to itself');
        map[from] = to;
        stored[from] = to;
        const seen = new Set<string>([from]);
        for (let t: string | undefined = to; t; t = map[t]) {
          if (seen.has(t)) throw new HqError('bad_args', `forwarding ${from} to ${to} makes a loop`);
          seen.add(t);
        }
      }
      db.query(`INSERT INTO meta (key, value) VALUES ('outbox_forwards', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(stored));
      let moved = 0;
      let merged = 0;
      if (to !== null) {
        const dest = forwardOf(db, from);
        const rows = db.query(`SELECT id, event_seq FROM outbox WHERE target = ? AND status IN ('pending', 'failed')`).all(from) as { id: number; event_seq: number }[];
        for (const r of rows) {
          const key = `hq-ev${r.event_seq}-${dest}`;
          if (db.query('SELECT 1 FROM outbox WHERE idem_key = ?').get(key)) {
            db.query('DELETE FROM outbox WHERE id = ?').run(r.id); // the same event already reaches dest
            merged++;
          } else {
            db.query(`UPDATE outbox SET target = ?, idem_key = ?, status = 'pending', last_error = NULL WHERE id = ?`).run(dest, key, r.id);
            moved++;
          }
        }
      }
      return { moved, merged };
    })
    .immediate();
}
