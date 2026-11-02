import type { Runner } from './types.ts';

export function boundedRunner(run: Runner, timeoutMs: number): Runner {
  return (cmd, opts = {}) => run(cmd, { ...opts, timeoutMs: opts.timeoutMs ?? timeoutMs });
}
