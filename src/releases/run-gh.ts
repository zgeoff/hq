import { HqError } from '../errors.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import type { Runner } from '../runner/types.ts';

export async function runGH(run: Runner, args: string[], what: string): Promise<string> {
  const r = await run(['gh', ...args], { env: cleanEnv() });
  if (r.code !== 0) throw new HqError('command_failed', `${what} failed (${r.code}): ${(r.stderr || r.stdout).trim().slice(0, 160)}`);
  return r.stdout;
}
