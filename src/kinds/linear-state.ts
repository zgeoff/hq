import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';

export function linearState(db: Database): { syncedAt: string | null; error: string | null } {
  return { syncedAt: getMeta(db, 'linear_synced_at'), error: getMeta(db, 'linear_error') || null };
}
