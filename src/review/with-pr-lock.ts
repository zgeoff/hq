import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    removeOwnLock(lock);
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
    if ((holder !== null && pidAlive(holder)) || !removeDeadLock(lock)) {
      rmSync(staged, { recursive: true, force: true });
      throw new HqError('locked', `another review of ${ref} runs${holder === null ? '' : ` (pid ${holder})`}; wait for it to end`);
    }
  }
  rmSync(staged, { recursive: true, force: true });
  throw new HqError('locked', `another review of ${ref} took the lock ${lock}; wait for it to end`);
}

const TAKEOVER_STALE_MS = 60_000;

// Takeovers run one at a time under their own lock, and each checks the holder again inside it:
// two callers that both saw a dead holder would otherwise each remove the lock, the second one
// removing the lock the first had just installed. False when another takeover is under way.
function removeDeadLock(lock: string): boolean {
  const takeover = `${lock}.takeover`;
  try {
    mkdirSync(takeover);
  } catch {
    // A takeover lasts milliseconds, so an old one is from a process that died inside it.
    if (Date.now() - readMtimeMs(takeover) <= TAKEOVER_STALE_MS) {
      return false;
    }
    rmSync(takeover, { recursive: true, force: true });
    return false;
  }
  try {
    const holder = readHolder(lock);
    if (holder !== null && pidAlive(holder)) {
      return false;
    }
    rmSync(lock, { recursive: true, force: true });
    return true;
  } finally {
    rmSync(takeover, { recursive: true, force: true });
  }
}

function readMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

// A lock another process took over after this one lost it is that process's to remove.
function removeOwnLock(lock: string): void {
  if (readHolder(lock) === process.pid) {
    rmSync(lock, { recursive: true, force: true });
  }
}

function readHolder(lock: string): number | null {
  try {
    const pid = Number(readFileSync(`${lock}/pid`, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}
