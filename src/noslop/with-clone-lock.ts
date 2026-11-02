import { mkdirSync } from 'node:fs';
import { config } from '../config/config.ts';
import { reviewDir } from '../review/review-dir.ts';
import { withPidLock } from '../review/with-pid-lock.ts';

// A pin can outlast any fixed age (install, migration query, backup and checks), so the lock lasts
// as long as its process.
export async function withCloneLock<T>(fn: () => Promise<T>): Promise<T> {
  const scratch = reviewDir();
  mkdirSync(scratch, { recursive: true });
  return await withPidLock(`${scratch}/.lock-zgeoff-noslop-clone`, 'another hq noslop pin', fn, config().HQ_REVIEW_LOCK_WAIT_MS);
}
