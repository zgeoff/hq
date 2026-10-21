import type { Runner } from './types.ts';

// A runner whose every call has a deadline unless the caller gives its own.
export function boundedRunner(run: Runner, timeoutMs: number): Runner {
  return (cmd, opts = {}) => run(cmd, { ...opts, timeoutMs: opts.timeoutMs ?? timeoutMs });
}
