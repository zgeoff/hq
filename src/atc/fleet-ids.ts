import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';

export function fleetIds(db: Database): Record<string, string> {
  try {
    const raw = JSON.parse(getMeta(db, 'fleet_ids') ?? '{}') as unknown;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}
