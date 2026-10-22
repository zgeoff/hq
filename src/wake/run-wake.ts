// After an atc daemon restart, message every session the restart cut off, every
// live session on the wake list (its background waits died with the daemon),
// and the orchestrator, whose loop wakeup died too.
import { toExactOptional } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { connectWithRetry } from './connect-with-retry.ts';
import { orchestratorName } from './orchestrator-name.ts';
import { planWake } from './plan-wake.ts';
import { readLastRestart } from './read-last-restart.ts';
import { resolveLoopPrompt } from './resolve-loop-prompt.ts';
import type { RestartRecord, WakeResult } from './types.ts';
import { wakeList } from './wake-list.ts';

export async function runWake(db: Database, opts: { dryRun: boolean; waitMs: number; actor: string; last?: RestartRecord }): Promise<WakeResult> {
  const last = opts.last ?? (await readLastRestart());
  const client = await connectWithRetry(opts.waitMs);
  try {
    const loop = resolveLoopPrompt({ write: !opts.dryRun });
    const plan = planWake(last, await client.sessions(), wakeList(db).map((e) => ({ id: e.session_id, name: e.name })), orchestratorName(), loop.path);
    const result: WakeResult = { runID: last.runID, sent: [], skipped: plan.skipped, dryRun: opts.dryRun, loopPrompt: loop };
    for (const m of plan.messages) {
      if (opts.dryRun) {
        result.sent.push({ session: m.session, name: m.name, reason: m.reason });
        continue;
      }
      try {
        const id = await client.message(m.session, m.text, 'orchestrator', m.idempotencyKey);
        result.sent.push({ session: m.session, name: m.name, reason: m.reason, ...toExactOptional({ message: id }) });
      } catch (e) {
        result.sent.push({ session: m.session, name: m.name, reason: m.reason, error: String((e as Error).message ?? e) });
      }
    }
    if (!opts.dryRun) {
      db.transaction(() => logEvent(db, 'hq', `restart:${last.runID}`, 'woke', opts.actor, null, null, { sent: result.sent, skipped: result.skipped })).immediate();
    }
    return result;
  } finally {
    client.close();
  }
}
