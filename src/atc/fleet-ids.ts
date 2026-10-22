import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';

// The session id hq fleet last saw live for each declared name (meta fleet_ids).
export function fleetIds(db: Database): Record<string, string> {
  try {
    const raw = JSON.parse(getMeta(db, 'fleet_ids') ?? '{}') as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}
