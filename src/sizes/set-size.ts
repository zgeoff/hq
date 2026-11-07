import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';
import { logEvent } from '../log-event.ts';
import type { Size } from './bands.ts';

const PreviousSizeSchema = buildRowSchema('runs').pick({ size: true, size_lines: true });

export function setSize(db: Database, issue: string, guess: { size: Size; lines: number }, actor: string): void {
  db.transaction(() => {
    const previous = runSyncRow(db, kdb(db).selectFrom('runs').select(['size', 'size_lines']).where('issue', '=', issue).compile(), PreviousSizeSchema);
    if (!previous) {
      throw new HqError('not_found', `no run ${issue}`);
    }
    db.query('UPDATE runs SET size = ?, size_lines = ?, updated_at = ? WHERE issue = ?').run(guess.size, guess.lines, iso(now()), issue);
    logEvent(db, 'run', issue, 'sized', actor, previous.size, guess.size, { lines: guess.lines, prevLines: previous.size_lines });
  }).immediate();
}
