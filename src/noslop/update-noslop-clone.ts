import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { HqError } from '../errors.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { buildRunDir } from './build-run-dir.ts';
import { requireOK } from './require-ok.ts';

export interface PinResult {
  sha: string;
  clone: string;
}

// Makes the folder for a commit: fetches the base clone (cloned on first use), adds a worktree at the
// commit and installs its dependencies, scripts off. A folder that failed its install is removed.
export async function updateNoslopClone(run: Runner, base: string, sha: string): Promise<PinResult> {
  await requireClone(run, base);
  await requireOK(run, ['git', 'fetch', '-q', 'origin'], base);
  const full = await requireOK(run, ['git', 'rev-parse', '--verify', `${sha}^{commit}`], base);
  return await createRunDir(run, base, full);
}

async function requireClone(run: Runner, clone: string): Promise<void> {
  if (existsSync(clone)) {
    return;
  }
  mkdirSync(dirname(clone), { recursive: true });
  await requireOK(run, ['gh', 'repo', 'clone', 'zgeoff/noslop', clone, '--', '-q'], dirname(clone));
}

// The commit's folder, made once: an installed folder is reused as it is.
async function createRunDir(run: Runner, base: string, full: string): Promise<PinResult> {
  const clone = buildRunDir(base, full);
  if (existsSync(`${clone}/node_modules`)) {
    return { sha: full, clone };
  }
  await run(['git', 'worktree', 'remove', '--force', clone], { cwd: base });
  await run(['git', 'worktree', 'prune'], { cwd: base });
  await requireOK(run, ['git', 'worktree', 'add', '-q', '--detach', clone, full], base);
  try {
    await runNoslopInstall(run, clone);
  } catch (error) {
    await run(['git', 'worktree', 'remove', '--force', clone], { cwd: base });
    throw error;
  }
  return { sha: full, clone };
}

const INSTALL_TIMEOUT_MS = 600_000,
  TAIL_CHARS = 300;

async function runNoslopInstall(run: Runner, clone: string): Promise<void> {
  const install = await boundedRunner(run, INSTALL_TIMEOUT_MS)(['bun', 'install', '--frozen-lockfile', '--ignore-scripts'], { cwd: clone });
  if (install.code !== 0) {
    const out = (install.stderr || install.stdout).trim().slice(-TAIL_CHARS);
    throw new HqError('command_failed', `bun install in ${clone} failed (${install.code}): ${out}`);
  }
}
