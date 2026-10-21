import { toExactOptional } from '@zgeoff/std';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';

export async function runCommand(run: Runner, cmd: string[], cwd?: string): Promise<string> {
  const r = await run(cmd, toExactOptional({ cwd }));
  if (r.code !== 0) throw new HqError('command_failed', `${cmd.slice(0, 3).join(' ')} failed (${r.code}): ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
  return r.stdout.trim();
}
