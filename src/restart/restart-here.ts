// Restart the atc daemon, then wake the sessions. The restart ends every
// session's process, so `hq restart` hands itself to systemd and returns; the
// detached copy (`--here`) does the work and writes a log.
import { toExactOptional } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { config } from '../config/config.ts';
import type { Runner } from '../runner/types.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import { connectWithRetry } from '../wake/connect-with-retry.ts';
import { readLastRestart } from '../wake/read-last-restart.ts';
import { runWake } from '../wake/run-wake.ts';
import { createLogDir } from './create-log-dir.ts';
import { guardQuiet } from './guard-quiet.ts';
import { listedSchema } from './listed-schema.ts';
import { logPath } from './log-path.ts';
import { PATH } from './path.ts';
import { settleRestores } from './settle-restores.ts';
import type { RestartResult, Settled } from './types.ts';

const restoreWaitMs = () => {
  const n = config().HQ_RESTORE_WAIT_MS;
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 600_000) : 180_000;
};

// The detached half. It logs each step; a failed dry run stops before the restart.
// The launcher already checked quiet hours and passes --force; a direct run checks here.
export async function restartHere(db: Database, run: Runner, actor: string, force: boolean): Promise<RestartResult> {
  guardQuiet(force);
  const log = config().HQ_RESTART_LOG ?? logPath(iso(now()).replace(/[-:]/g, ''));
  createLogDir(log);
  const write = async (line: string) => {
    const f = Bun.file(log);
    const prev = (await f.exists()) ? await f.text() : '';
    await Bun.write(log, `${prev}${line}\n`);
  };
  const env = cleanEnv({ PATH });
  await write(`== ${iso(now())} dry run`);
  const dry = await run(['atc', 'daemon', 'restart', '--dry-run'], { env, stdoutFile: log });
  if (dry.code !== 0) {
    await write(`dry run failed (${dry.code}): no restart`);
    return { log, dryRunCode: dry.code, restartCode: -1, settled: null, wake: { error: 'skipped: dry run failed' } };
  }
  await write(`== ${iso(now())} restart`);
  const restart = await run(['atc', 'daemon', 'restart'], { env, stdoutFile: log });
  await write(`restart exit ${restart.code}`);
  let settled: Settled | null = null;
  // Read atc's report once: the wake must use the same one, even if another restart writes a new one meanwhile.
  const last = await readLastRestart().catch(() => null);
  if (restart.code !== 0 && last) {
    try {
      if ((last.failed ?? []).length) {
        await write(`== ${iso(now())} waiting up to ${restoreWaitMs() / 1000}s for sessions still restoring`);
        const client = await connectWithRetry(60_000);
        try {
          settled = await settleRestores(last.failed, async () => (await client.call('session.list', {}, listedSchema)).sessions ?? [], { timeoutMs: restoreWaitMs(), pollMs: 5_000 });
        } finally {
          client.close();
        }
        for (const s of settled.late) await write(`restored late: ${s.name} (${s.id})`);
        for (const s of settled.down) await write(`still down: ${s.name} (${s.id}): ${s.reason}`);
        await write(settled.down.length ? `${settled.down.length} session(s) still down` : `all ${settled.late.length} restored late: the restart is good`);
      }
    } catch (e) {
      await write(`restore check failed: ${String((e as Error).message ?? e)}`);
    }
  }
  await write(`== ${iso(now())} wake`);
  let wake: RestartResult['wake'];
  try {
    wake = await runWake(db, toExactOptional({ dryRun: false, waitMs: 60_000, actor, last: last ?? undefined }));
    for (const s of wake.sent) await write(`${s.error ? 'failed' : 'messaged'} ${s.session} ${s.name} (${s.reason})${s.error ? `: ${s.error}` : `: ${s.message}`}`);
    for (const s of wake.skipped) await write(`skipped ${s.session || '-'} ${s.name}: ${s.why}`);
  } catch (e) {
    wake = { error: String((e as Error).message ?? e) };
    await write(`wake failed: ${wake.error}`);
  }
  await write(`== ${iso(now())} done`);
  return { log, dryRunCode: dry.code, restartCode: restart.code, settled, wake };
}
