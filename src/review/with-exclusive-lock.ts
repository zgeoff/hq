import { withFileLock } from '@zgeoff/std/with-file-lock';
import { HqError } from '../errors.ts';

// The kernel frees a dead holder's lock, so the lock has no age limit: one would hand the lock to
// the next caller while a slow holder still runs.
export async function withExclusiveLock<T>(lock: string, what: string, fn: () => Promise<T>, waitMs = 0): Promise<T> {
  const result = await withFileLock(lock, fn, { waitMs });
  if (result.kind === 'busy') {
    throw new HqError('locked', `${what} holds ${lock}${result.holder === null ? '' : ` (pid ${result.holder.pid})`}; wait for it to end`);
  }
  return result.value;
}
