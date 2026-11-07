import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';

const LaneSchema = buildRowSchema('runs').pick({ lane: true });

export function setRunLane(db: Database, issue: string, lane: string, actor: string): void {
  db.transaction(() => {
    const previous = runSyncRow(db, kdb(db).selectFrom('runs').select('lane').where('issue', '=', issue).compile(), LaneSchema);
    if (!previous) {
      throw new HqError('not_found', `no run ${issue}`);
    }
    db.query('UPDATE runs SET lane = ?, updated_at = ? WHERE issue = ?').run(lane, iso(now()), issue);
    logEvent(db, 'run', issue, 'lane', actor, previous.lane, lane, {});
  }).immediate();
}
