import { existsSync } from 'node:fs';
import type { Check } from './types.ts';

const OUTPUT_LINES = 10;

// Starts a command and waits for it. Tests pass a fake to pin the command line.
export type GrantsSpawn = (argv: string[], cwd: string) => Bun.SyncSubprocess<'pipe', 'pipe'>;

// The grants check on hq-private, run from the hq-defs checkout: a clone of hq, so it holds
// scripts/grants.ts and the still-ask list. hq-private has no CI of its own.
export function checkGrants(hqDir: string, privateDir: string, spawn: GrantsSpawn): Check {
  if (!existsSync(`${hqDir}/scripts/grants.ts`)) {
    return { ok: false, line: `grants: ${hqDir}/scripts/grants.ts is missing, so hq-private's grants and prompts can't be checked` };
  }
  try {
    return formatGrantsRun(spawn(['bun', 'scripts/grants.ts', '--check', '--private', privateDir], hqDir));
  } catch (error) {
    // Bun throws, rather than failing the run, when bun is not on PATH.
    return { ok: false, line: `grants: could not start bun: ${String((error as Error).message ?? error).slice(0, 200)}` };
  }
}

function formatGrantsRun(run: Bun.SyncSubprocess<'pipe', 'pipe'>): Check {
  const lines = `${run.stderr.toString()}\n${run.stdout.toString()}`.split('\n').filter((line) => line.trim());
  if (run.exitCode === 0) {
    return { ok: true, line: `grants: hq-private's grants and prompts match (${lines.at(-1) ?? 'no output'})` };
  }
  return { ok: false, line: `grants: grants.ts --check --private failed (${formatExit(run.exitCode)})\n${lines.slice(0, OUTPUT_LINES).map((line) => `    ${line.slice(0, 200)}`).join('\n')}` };
}

function formatExit(code: number | null): string {
  return code === null ? 'timed out after 60s' : `exit ${code}`;
}
