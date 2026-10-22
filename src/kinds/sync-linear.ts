import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import type { LinearCall } from '../linear/types.ts';
import { syncClosed } from '../linear/sync-closed.ts';
import { syncFiled } from '../linear/sync-filed.ts';
import { syncPrIssues } from '../linear/sync-pr-issues.ts';
import { syncStarted } from '../linear/sync-started.ts';

// The Linear side of a sync: closed issues and the types of issues merged PRs name, then the issues
// filed and In Progress. A failed read of the filed or In Progress issues keeps the issue types and
// marks the throughput lines unavailable until a later read succeeds.
export async function syncLinear(db: Database, call: LinearCall, from: Date, at: Date = now()): Promise<{ closed: number; typed: number; filed: number; started: number }> {
  let closed = 0;
  let typed = 0;
  try {
    closed = await syncClosed(db, call, from, at);
    typed = await syncPrIssues(db, call);
    setMeta(db, 'linear_synced_at', iso(at));
    setMeta(db, 'linear_error', '');
  } catch (e) {
    setMeta(db, 'linear_error', String((e as Error).message ?? e).slice(0, 300));
    throw e;
  }
  let filed = 0;
  let started = 0;
  try {
    filed = await syncFiled(db, call, from, at);
    started = await syncStarted(db, call, at);
    setMeta(db, 'linear_throughput_at', iso(at));
    setMeta(db, 'linear_throughput_error', '');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setMeta(db, 'linear_throughput_error', message.slice(0, 300));
    throw error;
  }
  return { closed, typed, filed, started };
}
