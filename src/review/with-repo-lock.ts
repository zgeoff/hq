import { mkdirSync, rmSync, statSync, utimesSync } from 'node:fs';
import { config } from '../config/config.ts';
import { HqError } from '../errors.ts';

// Same-repo reviews share one checkout: a lock per repo around the git steps that change it, so
// parallel fetches don't race on its refs. The holder stamps the lock's mtime with the time it goes
// stale, so a waiter takes over only a lock past its holder's own staleMs, whatever staleMs the waiter
// was given. The margin covers the moment between mkdir and the stamp.
const TAKEOVER_MARGIN_MS = 60_000;

export async function withRepoLock<T>(dir: string, slug: string, fn: () => Promise<T>, staleMs = 600_000): Promise<T> {
  const lock = `${dir}/.lock-${slug.replace('/', '-')}`;
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      const stale = new Date(Date.now() + staleMs);
      utimesSync(lock, stale, stale);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try {
        if (Date.now() > statSync(lock).mtimeMs + TAKEOVER_MARGIN_MS) {
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
