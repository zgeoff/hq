import { HqError } from '../errors.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import { toRunFailure } from '../runner/to-run-failure.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';

const MISSING_PATH = /\bNot Found \(HTTP 404\)/u;

// A file of zgeoff/hq at a commit, or null when the commit has no such file. Any other failure
// throws, so a flaky read is never taken for a missing file.
export async function readRefFile(run: Runner, sha: string, path: string): Promise<string | null> {
  const result = await boundedRunner(run, CALL_MS)(['gh', 'api', `repos/zgeoff/hq/contents/${path}?ref=${sha}`, '-H', 'Accept: application/vnd.github.raw']).catch(toRunFailure);
  if (result.code === 0) {
    return result.stdout;
  }
  if (MISSING_PATH.test(result.stderr)) {
    return null;
  }
  throw new HqError('command_failed', `could not read ${path} at ${sha.slice(0, 7)}: ${(result.stderr || result.stdout).trim().slice(0, 200)}`);
}
