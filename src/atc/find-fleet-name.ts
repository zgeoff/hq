import type { Database } from 'bun:sqlite';
import { fleetIds } from './fleet-ids.ts';

export function findFleetName(db: Database, id: string): string | null {
  return Object.entries(fleetIds(db)).find(([, session]) => session === id)?.[0] ?? null;
}
