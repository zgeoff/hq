import { toExactOptional } from '@zgeoff/std';
import { closeSync, openSync } from 'node:fs';
import { cleanEnv } from './clean-env.ts';
import { TIMED_OUT } from './timed-out.ts';
import type { RunResult, Runner } from './types.ts';

// With stdoutFile, stdout and stderr both append to that file through one descriptor.
export const realRunner: Runner = async (cmd, opts = {}) => {
  const fd = opts.stdoutFile ? openSync(opts.stdoutFile, 'a') : null;
  // A timed command runs in its own session (setsid), so the deadline reaches its whole process
  // group, not just the shell at the top of it.
  const proc = Bun.spawn(opts.timeoutMs ? ['setsid', ...cmd] : cmd, {
    ...toExactOptional({ cwd: opts.cwd, signal: opts.signal }),
    env: opts.env ?? cleanEnv(),
    stdin: opts.stdin === undefined ? 'ignore' : Buffer.from(opts.stdin),
    stdout: fd ?? 'pipe',
    stderr: fd ?? 'pipe',
  });

  // TERM to the group at the deadline, KILL killGraceMs later even if the shell has gone: a
  // descendant that ignored TERM must not live on.
  let timedOut = false;
  const group = (sig: NodeJS.Signals) => {
    try {
      process.kill(-proc.pid, sig);
    } catch {}
    try {
      proc.kill(sig);
    } catch {}
  };
  const timer = opts.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        group('SIGTERM');

        // Not unref'd: a one-shot hq command waits out the grace, so the KILL lands before it exits.
        setTimeout(() => group('SIGKILL'), opts.killGraceMs ?? 2000);
      }, opts.timeoutMs)
    : null;
  const done = (r: RunResult): RunResult => {
    if (timer) clearTimeout(timer);
    return timedOut ? { code: TIMED_OUT, stdout: r.stdout, stderr: `${cmd[0]} timed out after ${Math.round(opts.timeoutMs! / 1000)} s${r.stderr ? `; ${r.stderr}` : ''}` } : r;
  };
  if (fd !== null) {
    const code = await proc.exited;
    closeSync(fd);
    return done({ code, stdout: '', stderr: '' });
  }
  const out = proc.stdout instanceof ReadableStream ? new Response(proc.stdout).text() : Promise.resolve('');
  const err = proc.stderr instanceof ReadableStream ? new Response(proc.stderr).text() : Promise.resolve('');
  if (!opts.timeoutMs) {
    const [stdout, stderr] = await Promise.all([out, err]);
    return { code: await proc.exited, stdout, stderr };
  }
  // With a deadline, the exit ends the wait: a grandchild holding a pipe open must not hang us.
  const code = await proc.exited;
  const settleMs = opts.settleMs ?? (timedOut ? 500 : 1000);
  const silence = async () => {
    await Bun.sleep(settleMs);
    return '';
  };
  const settle = (output: Promise<string>) => Promise.race([output, silence()]);
  return done({ code, stdout: await settle(out), stderr: await settle(err) });
};
