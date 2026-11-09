import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { decideUmbrellaBoxes } from '../linear/decide-umbrella-boxes.ts';
import type { LinearCall } from '../linear/types.ts';
import type { Runner } from '../runner/types.ts';
import { syncClosed } from '../linear/sync-closed.ts';
import { syncFiled } from '../linear/sync-filed.ts';
import { syncInReview } from '../linear/sync-in-review.ts';
import { syncPRIssues } from '../linear/sync-pr-issues.ts';
import { syncStarted } from '../linear/sync-started.ts';
import { toErrorMessage } from '../to-error-message.ts';

interface SyncLinearOptions {
  at?: Date;
  run?: Runner;
}

export async function syncLinear(db: Database, call: LinearCall, from: Date, options: SyncLinearOptions = {}): Promise<{ closed: number; typed: number; filed: number; started: number; inReview: number }> {
  const at = options.at ?? now();
  let closed = 0;
  let typed = 0;
  try {
    closed = await syncClosed(db, call, from, at);
    typed = await syncPRIssues(db, call);
    await decideUmbrellaBoxes(db, call, at);
    setMeta(db, 'linear_synced_at', iso(at));
    setMeta(db, 'linear_error', '');
  } catch (e) {
    setMeta(db, 'linear_error', toErrorMessage(e).slice(0, 300));
    throw e;
  }
  let filed = 0;
  let started = 0;
  let inReview = 0;
  try {
    filed = await syncFiled(db, call, from, { to: at, run: options.run });
    started = await syncStarted(db, call, at);
    inReview = await syncInReview(db, call, at);
    setMeta(db, 'linear_throughput_at', iso(at));
    setMeta(db, 'linear_throughput_error', '');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setMeta(db, 'linear_throughput_error', message.slice(0, 300));
    throw error;
  }
  return { closed, typed, filed, started, inReview };
}
