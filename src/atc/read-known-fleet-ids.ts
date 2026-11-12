import type { Database } from 'bun:sqlite';
import { forwardOf } from '../outbox/forward-of.ts';
import { fleetIds } from './fleet-ids.ts';

// Until hq fleet ensure records a renamed session under its new name, the id recorded under the
// retired name that forwards to it stands in, so its messages and its role checks still find it.
export function readKnownFleetIDs(db: Database): Record<string, string> {
  const recorded = fleetIds(db);
  const known = { ...recorded };
  for (const [name, id] of Object.entries(recorded)) {
    const current = forwardOf(db, name);
    if (current !== name && recorded[current] === undefined && known[current] === undefined) {
      known[current] = id;
    }
  }
  return known;
}
