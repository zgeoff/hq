import { boundedRunner } from '../runner/bounded-runner.ts';
import { toRunFailure } from '../runner/to-run-failure.ts';
import type { Runner } from '../runner/types.ts';
import { CALL_MS } from '../watcher/call-ms.ts';

// GitHub's answer for a path the commit does not hold. A head it cannot find answers 404 too, but
// with "No commit found", so only a missing folder matches.
const MISSING_PATH = /\bNot Found \(HTTP 404\)/u;

export async function probeNoCI(run: Runner, slug: string, head: string): Promise<boolean> {
  const result = await boundedRunner(run, CALL_MS)(['gh', 'api', `repos/${slug}/contents/.github/workflows?ref=${head}`, '--silent']).catch(toRunFailure);
  return result.code !== 0 && MISSING_PATH.test(result.stderr);
}
