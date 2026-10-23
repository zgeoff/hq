import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { requireOpenRun } from './require-open-run.ts';
import type { RunView } from './types.ts';
import { viewRun } from './view-run.ts';

export interface PlaceChange {
  issue: string;
  place: string;
  note: string | null;
  actor: string;
}

export type PlaceResult = { ok: true; run: RunView } | { ok: false; refusal: string };

const placeSchema = z.enum(['imp', 'local', 'none']);

// Moves an open run to another place and logs the move with its note; the lanes count it there from
// their next look. A bad place, or one equal to the run's own, comes back as a refusal, so a slip
// never logs a move; a missing or closed run still throws, as every run setter does.
export function setPlace(db: Database, change: PlaceChange): PlaceResult {
  const issue = change.issue;
  const parsed = placeSchema.safeParse(change.place);
  if (!parsed.success) {
    return { ok: false, refusal: `place must be imp, local or none, not "${change.place.slice(0, 60)}"` };
  }
  const to = parsed.data;
  return db
    .transaction((): PlaceResult => {
      const run = requireOpenRun(db, issue);
      if (run.place === to) {
        return { ok: false, refusal: `${issue} is already ${to}` };
      }
      const at = iso(now());
      db.query('UPDATE runs SET place = ?, updated_at = ? WHERE issue = ?').run(to, at, issue);
      logEvent(db, 'run', issue, 'place', change.actor, run.place, to, { note: change.note });
      return { ok: true, run: viewRun(db, { ...run, place: to, updated_at: at }) };
    })
    .immediate();
}
