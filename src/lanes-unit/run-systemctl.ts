import { toExactOptional } from '@zgeoff/std';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';

export async function runSystemctl(run: Runner, args: string[], env?: Record<string, string | undefined>): Promise<string> {
  const r = await run(['systemctl', '--user', ...args], toExactOptional({ env }));
  if (r.code !== 0) throw new HqError('systemctl_failed', `systemctl --user ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}
