import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';

// Minutes since the oldest of the goals data was last synced without a failure: CI runs
// (goals_ok_at, set by the watcher and by hq goals sync), merged PR kinds (kinds_ok_at) and Linear
// issue types (linear_synced_at, set only on success). Null when any never was or is unreadable.
export function goalsAge(db: Database, at: Date): number | null {
  let oldest = Infinity;
  for (const k of ['goals_ok_at', 'kinds_ok_at', 'linear_synced_at']) {
    const t = Date.parse(getMeta(db, k) ?? '');
    if (!Number.isFinite(t)) return null;
    oldest = Math.min(oldest, t);
  }
  return Math.max(0, Math.floor((at.getTime() - oldest) / 60_000));
}
