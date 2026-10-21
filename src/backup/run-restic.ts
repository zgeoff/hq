import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { loadResticEnv as resticEnv } from './load-restic-env.ts';

// restic reshapes a repository URL in its messages, so no find-and-replace can be trusted
// to hide a key in it: a remote failure reports only the step and the exit code.
export async function runRestic(run: Runner, args: string[], extra: Record<string, string> = {}): Promise<string> {
  const r = await run(['restic', ...args], { env: resticEnv(extra) });
  if (r.code !== 0) {
    const verb = args[0] === '-r' ? args[2] : args[0];
    if (Object.keys(extra).length) throw new HqError('restic_failed', `restic ${verb} on the remote failed (exit ${r.code}); details withheld, as the remote config holds secrets`);
    throw new HqError('restic_failed', `restic ${verb} failed (${r.code}): ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ').slice(0, 400)}`);
  }
  return r.stdout;
}
