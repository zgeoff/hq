import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';
import { logEvent } from '../log-event.ts';
import type { WakeEntry } from './types.ts';

const WakeEntrySchema = buildRowSchema('wake_list');

export function wakeRemove(db: Database, idOrName: string, actor: string): WakeEntry {
  return db
    .transaction(() => {
      const query = kdb(db)
        .selectFrom('wake_list')
        .selectAll()
        .where((eb) => eb.or([eb('session_id', '=', idOrName), eb('name', '=', idOrName)]))
        .compile();
      const rows = runSyncQuery(db, query, WakeEntrySchema);
      if (rows.length === 0) throw new HqError('not_found', `${idOrName} is not on the wake list`);
      if (rows.length > 1) throw new HqError('ambiguous_session', `${rows.length} entries match ${idOrName}: use the id`);
      db.query('DELETE FROM wake_list WHERE session_id = ?').run(rows[0]!.session_id);
      logEvent(db, 'hq', `wake:${rows[0]!.session_id}`, 'wake-removed', actor, null, null, { name: rows[0]!.name });
      return rows[0]!;
    })
    .immediate();
}
