import { mkdirSync, rmSync, statSync } from 'node:fs';
import { config } from '../config/config.ts';
import { HqError } from '../errors.ts';

// Same-repo reviews share one checkout: a lock per repo around the git steps that change it, so
// parallel fetches don't race on its refs. A lock older than staleMs is taken over.
export async function withRepoLock<T>(dir: string, slug: string, fn: () => Promise<T>, staleMs = 600_000): Promise<T> {
  const lock = `${dir}/.lock-${slug.replace('/', '-')}`;
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > staleMs) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - start > getLockWaitMs()) {
        throw new HqError('locked', `another review holds ${lock}; try again, or remove it if no review runs`);
      }
      await Bun.sleep(250);
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function getLockWaitMs(): number {
  return config().HQ_REVIEW_LOCK_WAIT_MS;
}
