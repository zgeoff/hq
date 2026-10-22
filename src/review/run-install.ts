import { existsSync } from 'node:fs';
import { boundedRunner } from '../runner/bounded-runner.ts';
import { TIMED_OUT } from '../runner/timed-out.ts';
import type { Runner } from '../runner/types.ts';
import type { ReviewResult } from './types.ts';

// A workspace dependency (atc's @atc/protocol/session) resolves only after an install, so Codex can
// run the repo's tests. Lifecycle scripts stay off: the branch under review is not yet trusted.
export async function runInstall(run: Runner, wt: string, env: Record<string, string | undefined>, timeoutMs = 600_000): Promise<ReviewResult['install']> {
  if (!existsSync(`${wt}/bun.lock`) && !existsSync(`${wt}/bun.lockb`)) {
    return { detail: 'no bun.lock', ok: true, ran: false };
  }
  const result = await boundedRunner(run, timeoutMs)(['bun', 'install', '--frozen-lockfile', '--ignore-scripts'], { cwd: wt, env });
  if (result.code === TIMED_OUT) {
    return { detail: `bun install gave no answer in ${timeoutMs / 1000} s`, ok: false, ran: true };
  }
  if (result.code !== 0) {
    return { detail: `bun install failed (${result.code}): ${(result.stderr || result.stdout).trim().slice(-300)}`, ok: false, ran: true };
  }
  return { detail: 'bun install --frozen-lockfile --ignore-scripts', ok: true, ran: true };
}
