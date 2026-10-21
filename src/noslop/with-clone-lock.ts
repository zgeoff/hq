import { mkdirSync } from 'node:fs';
import { reviewDir } from '../review/review-dir.ts';
import { withRepoLock } from '../review/with-repo-lock.ts';

const INSTALL_TIMEOUT_MS = 600_000;

// One lock for hq's base clone of noslop, held by `hq noslop pin` only. A run never takes it: it
// runs from the folder of its own pinned commit, which no pin changes. The lock outlives a slow
// install before another pin may take it over.
export async function withCloneLock<T>(fn: () => Promise<T>): Promise<T> {
  const scratch = reviewDir();
  mkdirSync(scratch, { recursive: true });
  return await withRepoLock(scratch, 'zgeoff/noslop-clone', fn, INSTALL_TIMEOUT_MS + 300_000);
}
