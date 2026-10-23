import type { InstallResult } from './run-deps-install.ts';

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
