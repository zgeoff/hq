import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { requireOpenRun } from './require-open-run.ts';
import type { RunView } from './types.ts';
import { viewRun } from './view-run.ts';

const placeSchema = z.enum(['imp', 'local', 'none']);

// Moves an open run to another place and logs the move with its note; the lanes count it there from
// their next look. A place equal to the run's own is refused, so a slip never logs a move.
export function setPlace(db: Database, issue: string, place: string, note: string | null, actor: string): RunView {
  const parsed = placeSchema.safeParse(place);
  if (!parsed.success) {
    throw new HqError('bad_args', `place must be imp, local or none, not "${place.slice(0, 60)}"`);
  }
  const to = parsed.data;
  return db
    .transaction(() => {
      const run = requireOpenRun(db, issue);
      if (run.place === to) {
        throw new HqError('bad_args', `${issue} is already ${to}`);
      }
      const at = iso(now());
      db.query('UPDATE runs SET place = ?, updated_at = ? WHERE issue = ?').run(to, at, issue);
      logEvent(db, 'run', issue, 'place', actor, run.place, to, { note });
      return viewRun(db, { ...run, place: to, updated_at: at });
    })
    .immediate();
}
