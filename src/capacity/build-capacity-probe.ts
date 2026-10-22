import { cleanEnv } from '../runner/clean-env.ts';
import { realRunner } from '../runner/real-runner.ts';
import type { CapacityProbe } from './types.ts';

// The watcher's probe: each command under coreutils timeout, with the caller's env (the 1Password
// token, for one) merged over this process's, less a session's atc variables.
export function buildCapacityProbe(): CapacityProbe {
  return {
    run: (cmd, opts) => realRunner(['timeout', '-k', '2', '15', ...cmd], { ...opts, env: cleanEnv(opts?.env) }),
    readText: async (url, timeoutMs) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) throw new Error(`${url} answered ${r.status}`);
      return r.text();
    },
    readFile: (path) => Bun.file(path).text(),
  };
}
