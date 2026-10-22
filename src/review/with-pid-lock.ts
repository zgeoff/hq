import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { HqError } from '../errors.ts';
import { pidAlive } from '../rc/pid-alive.ts';
import { isStaleTakeover } from './is-stale-takeover.ts';

const LOCK_POLL_MS = 250;

// A lock held for as long as its process lives: a lock whose process is gone is taken over, and no
// age limit applies, since one would hand a lock to the next caller while a slow holder still runs.
// A held lock is waited on for up to waitMs, then refused; `what` names the holder in the refusal.
export async function withPidLock<T>(lock: string, what: string, fn: () => Promise<T>, waitMs = 0): Promise<T> {
  const start = Date.now();
  while (!tryCreateLock(lock)) {
    if (Date.now() - start >= waitMs) {
      const holder = readHolder(lock);
      throw new HqError('locked', `${what} holds ${lock}${holder === null ? '' : ` (pid ${holder})`}; wait for it to end`);
    }
    await Bun.sleep(LOCK_POLL_MS);
  }
  try {
    return await fn();
  } finally {
    removeOwnLock(lock);
  }
}

// The lock is staged with its pid file and renamed into place, so no reader sees a lock without one.
function tryCreateLock(lock: string): boolean {
  const staged = `${lock}.${process.pid}`;
  rmSync(staged, { recursive: true, force: true });
  mkdirSync(staged);
  writeFileSync(`${staged}/pid`, String(process.pid));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      renameSync(staged, lock);
      return true;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') {
        rmSync(staged, { recursive: true, force: true });
        throw error;
      }
    }
    const holder = readHolder(lock);
    if ((holder !== null && pidAlive(holder)) || !removeDeadLock(lock)) {
      break;
    }
  }
  rmSync(staged, { recursive: true, force: true });
  return false;
}

// Takeovers run one at a time under their own lock, and each checks the holder again inside it:
// two callers that both saw a dead holder would otherwise each remove the lock, the second one
// removing the lock the first had just installed. False when another takeover is under way.
function removeDeadLock(lock: string): boolean {
  const takeover = `${lock}.takeover`;
  try {
    mkdirSync(takeover);
  } catch {
    if (!isStaleTakeover(readMtimeMs(takeover), Date.now())) {
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

function readMtimeMs(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
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
