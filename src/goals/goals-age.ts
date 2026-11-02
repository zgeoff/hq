import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';

export function goalsAge(db: Database, at: Date): number | null {
  let oldest = Infinity;
  for (const k of ['goals_ok_at', 'kinds_ok_at', 'linear_synced_at']) {
    const t = Date.parse(getMeta(db, k) ?? '');
    if (!Number.isFinite(t)) return null;
    oldest = Math.min(oldest, t);
  }
  return Math.max(0, Math.floor((at.getTime() - oldest) / 60_000));
}
