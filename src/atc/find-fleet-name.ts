import type { Database } from 'bun:sqlite';
import { fleetIds } from './fleet-ids.ts';

// The declared fleet name whose session hq fleet last saw live under `id`; none for any other id.
export function findFleetName(db: Database, id: string): string | null {
  return Object.entries(fleetIds(db)).find(([, session]) => session === id)?.[0] ?? null;
}
