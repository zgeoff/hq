import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';

const TAIL_CHARS = 300;

export async function requireOK(run: Runner, cmd: string[], cwd: string): Promise<string> {
  const result = await run(cmd, { cwd });
  if (result.code !== 0) {
    const out = (result.stderr || result.stdout).trim().slice(0, TAIL_CHARS);
    throw new HqError('command_failed', `${cmd.slice(0, 3).join(' ')} failed (${result.code}): ${out}`);
  }
  return result.stdout.trim();
}
