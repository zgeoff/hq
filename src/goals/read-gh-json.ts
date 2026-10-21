import { toExactOptional } from '@zgeoff/std';
import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';

export async function readGhJSON(run: Runner, args: string[], env: RunOpts['env'], what: string): Promise<unknown> {
  const r = await run(['gh', ...args], toExactOptional({ env }));
  if (r.code !== 0) throw new HqError('command_failed', `${what} failed (${r.code}): ${(r.stderr || r.stdout).trim().slice(0, 200)}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new HqError('command_failed', `${what} returned no JSON`);
  }
}
