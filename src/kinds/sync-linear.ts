import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import type { LinearCall } from '../linear/types.ts';
import { syncClosed } from '../linear/sync-closed.ts';
import { syncPrIssues } from '../linear/sync-pr-issues.ts';

// The Linear side of a sync: issues closed since `from`, then the types of issues merged PRs name.
// The outcome is kept in meta for the stats text; an error never holds back the GitHub side.
export async function syncLinear(db: Database, call: LinearCall, from: Date, at: Date = now()): Promise<{ closed: number; typed: number }> {
  try {
    const closed = await syncClosed(db, call, from, at);
    const typed = await syncPrIssues(db, call);
    setMeta(db, 'linear_synced_at', iso(at));
    setMeta(db, 'linear_error', '');
    return { closed, typed };
  } catch (e) {
    setMeta(db, 'linear_error', String((e as Error).message ?? e).slice(0, 300));
    throw e;
  }
}
