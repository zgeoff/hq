import { HqError } from '../errors.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import { toRunFailure } from '../runner/to-run-failure.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';

const FULL_SHA = /^[0-9a-f]{40}$/u;

// The full commit sha a ref of zgeoff/hq points at.
export async function readRefSHA(run: Runner, ref: string): Promise<string> {
  const result = await boundedRunner(run, CALL_MS)(['gh', 'api', `repos/zgeoff/hq/commits/${ref}`, '--jq', '.sha']).catch(toRunFailure);
  const sha = result.stdout.trim();
  if (result.code !== 0 || !FULL_SHA.test(sha)) {
    throw new HqError('command_failed', `could not resolve --ref ${ref} in zgeoff/hq: ${(result.stderr || result.stdout).trim().slice(0, 200)}`);
  }
  return sha;
}
