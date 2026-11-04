import { HqError } from '../errors.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';

// A failure that is not a 404 says nothing about the repo, so it throws.
export async function probeRepo(run: Runner, repo: string): Promise<boolean> {
  const result = await boundedRunner(run, CALL_MS)(['gh', 'api', `repos/zgeoff/${repo}`, '--jq', '.name'], { env: cleanEnv() });
  if (result.code === 0) {
    return true;
  }
  const said = (result.stderr || result.stdout).trim();
  if (/\b404\b|Not Found/u.test(said)) {
    return false;
  }
  throw new HqError('command_failed', `gh cannot tell if zgeoff/${repo} exists (${result.code}): ${said.slice(0, 160)}`);
}
