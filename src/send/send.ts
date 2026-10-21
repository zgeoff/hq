// hq's send (GEO-1021, from cli.ts): the rows a command queued, inline or through a detached
// unit when the command runs inside an atc session.
import { toExactOptional } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { config } from '../config/config.ts';
import type { DetachResult, FlushResult } from '../outbox/types.ts';
import { detachFlush } from '../outbox/detach-flush.ts';
import { flush } from '../outbox/flush.ts';
import { inSession } from '../outbox/in-session.ts';
import { unsent } from '../outbox/unsent.ts';
import { selfCommand } from '../restart/self-command.ts';
import type { Runner } from '../runner/types.ts';
import { hqSetenv } from '../runner/hq-setenv.ts';
import { awaitDetached } from './await-detached.ts';
import { sendWaitMs } from './send-wait-ms.ts';

// `scope` is the ids of the rows this command queued, or 'all' for `hq outbox flush`.
export async function send(
  db: Database,
  scope: number[] | 'all',
  retry: boolean,
  run: Runner,
  waitMs = sendWaitMs(),
): Promise<{ flushed: (FlushResult & { pending?: number }) | null; detached: DetachResult | null }> {
  const ids = scope === 'all' ? undefined : scope;
  if (inSession() && config().HQ_NOTIFY !== 'off') {
    const start = unsent(db, retry, ids, 'id, attempts') as { id: number; attempts: number }[];
    if (start.length > 0) {
      const detached = await detachFlush(run, selfCommand(), hqSetenv(), retry, ids);
      if (detached.unit) return { flushed: await awaitDetached(db, start, waitMs), detached };
      return { flushed: await flush(db, toExactOptional({ retryFailed: retry, ids })), detached };
    }
  }
  return { flushed: await flush(db, toExactOptional({ retryFailed: retry, ids })), detached: null };
}
