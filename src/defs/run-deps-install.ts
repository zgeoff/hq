import type { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';

const INSTALLED_LOCK = 'defs_installed_lock';

export interface InstallResult {
  code: number | null;
  err: string;
}

export type Install = (directory: string) => InstallResult;

// z-steward (2026-10-23): sessions run the repo's scripts in hq-defs, such as check:skills. hq
// installs when node_modules is missing or bun.lock differs from the last good install; a failed
// install turns the tree red for hq health, keeps the sync, and runs again on the next tick.
export function runDepsInstall(db: Database, directory: string, actor: string, install: Install): { ok: boolean; line: string } | null {
  const lockPath = `${directory}/bun.lock`;
  if (!existsSync(lockPath)) {
    return null;
  }
  const lock = createHash('sha256').update(readFileSync(lockPath)).digest('hex');
  if (existsSync(`${directory}/node_modules`) && getMeta(db, INSTALLED_LOCK) === lock) {
    return null;
  }
  const result = install(directory);
  if (result.code !== 0) {
    logEvent(db, 'hq', 'defs', 'deps-install-failed', actor, null, null, { code: result.code, err: result.err.slice(0, 300) });
    return { ok: false, line: `bun install failed (${result.code}): ${result.err.slice(0, 200)}` };
  }
  setMeta(db, INSTALLED_LOCK, lock);
  logEvent(db, 'hq', 'defs', 'deps-installed', actor, null, null, { lock: lock.slice(0, 12) });
  return { ok: true, line: 'installed its dependencies' };
}

interface SpawnResult {
  exitCode: number | null;
  stderr: { toString: () => string };
}

interface SpawnOptions {
  cwd: string;
  timeout: number;
}

export type Spawn = (command: string[], options: SpawnOptions) => SpawnResult;

// z-review (2026-10-23): no lifecycle script runs in the shared checkout, the repo's own included.
export function runBunInstall(directory: string, spawn: Spawn = (command, options) => Bun.spawnSync(command, options)): InstallResult {
  const result = spawn(['bun', 'install', '--frozen-lockfile', '--ignore-scripts'], { cwd: directory, timeout: 300_000 });
  return { code: result.exitCode, err: result.stderr.toString().trim() };
}
