import { mkdirSync } from 'node:fs';
import { config } from '../config/config.ts';
import { reviewDir } from '../review/review-dir.ts';
import { withPidLock } from '../review/with-pid-lock.ts';

// One lock for hq's base clone of noslop, held by `hq noslop pin` only. A run never takes it: it
// runs from the folder of its own pinned commit, which no pin changes. A pin can outlast any fixed
// age (install, migration query, backup and checks), so the lock lasts as long as its process.
export async function withCloneLock<T>(fn: () => Promise<T>): Promise<T> {
  const scratch = reviewDir();
  mkdirSync(scratch, { recursive: true });
  return await withPidLock(`${scratch}/.lock-zgeoff-noslop-clone`, 'another hq noslop pin', fn, config().HQ_REVIEW_LOCK_WAIT_MS);
}
