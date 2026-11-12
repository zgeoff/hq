import type { Database } from 'bun:sqlite';
import { forwardOf } from '../outbox/forward-of.ts';
import { fleetIds } from './fleet-ids.ts';

export function findFleetName(db: Database, id: string): string | null {
  const recorded = Object.entries(fleetIds(db)).find(([, session]) => session === id)?.[0];
  return recorded === undefined ? null : forwardOf(db, recorded);
}
