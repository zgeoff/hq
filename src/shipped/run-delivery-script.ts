import { join } from 'node:path';
import { HqError } from '../errors.ts';
import type { ShippedSources } from './types.ts';

// Runs one of the delivery-report scripts and gives its output; a failure names the script and the
// first line of its error.
export async function runDeliveryScript(sources: ShippedSources, script: string, args: string[]): Promise<string> {
  const TIMEOUT_MS = 120_000,
    result = await sources.run(['bash', join(sources.scripts, script), ...args], { timeoutMs: TIMEOUT_MS });
  if (result.code !== 0) {
    throw new HqError('shipped_failed', `${script} exited ${result.code}: ${result.stderr.trim().split('\n')[0] ?? ''}`.slice(0, 300));
  }
  return result.stdout;
}
