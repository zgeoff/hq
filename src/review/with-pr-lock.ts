import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { HqError } from '../errors.ts';
import { pidAlive } from '../rc/pid-alive.ts';

// One review of a PR at a time, since its reviews share one worktree and one set of files. A review
// runs for many minutes, so a second call fails at once, and only a lock whose process is gone is
// taken over: an age limit would hand a running review's worktree to the next call.
export async function withPRLock<T>(lock: string, ref: string, fn: () => Promise<T>): Promise<T> {
  createPRLock(lock, ref);
  try {
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

// The lock is staged with its pid file and renamed into place, so no reader sees a lock without one.
function createPRLock(lock: string, ref: string): void {
  const staged = `${lock}.${process.pid}`;
  rmSync(staged, { recursive: true, force: true });
  mkdirSync(staged);
  writeFileSync(`${staged}/pid`, String(process.pid));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      renameSync(staged, lock);
      return;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') {
        rmSync(staged, { recursive: true, force: true });
        throw error;
      }
    }
    const holder = readHolder(lock);
    if (holder !== null && pidAlive(holder)) {
      rmSync(staged, { recursive: true, force: true });
      throw new HqError('locked', `another review of ${ref} runs (pid ${holder}); wait for it to end`);
    }
    rmSync(lock, { recursive: true, force: true });
  }
  rmSync(staged, { recursive: true, force: true });
  throw new HqError('locked', `another review of ${ref} took the lock ${lock}; wait for it to end`);
}

function readHolder(lock: string): number | null {
  try {
    const pid = Number(readFileSync(`${lock}/pid`, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}
