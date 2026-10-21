import type { Runner } from '../runner/types.ts';
import { COMMAND_TIMEOUT_MS } from './command-timeout-ms.ts';

// A command that hangs counts as a failed read, so it can't stall the watcher.
export async function out(run: Runner, cmd: string[], timeoutMs = COMMAND_TIMEOUT_MS): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([run(cmd), new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), timeoutMs)))]);
    return r && r.code === 0 ? r.stdout : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
