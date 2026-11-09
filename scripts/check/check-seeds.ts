import { spawnSync } from 'node:child_process';
import { parseOxlintReport } from '../check-casts.ts';

interface Row {
  readonly code: string;
}

export function checkSeeds(rows: readonly Row[]): number {
  const counts = collectSeedCounts(rows);
  console.log(formatSeedCounts(counts));
  if (Object.values(counts).every((count) => count === 0)) {
    return 0;
  }
  return 1;
}

const SEED_RULES = ['seed-only', 'function-verb', 'test-beside-seed'] as const;

export function collectSeedCounts(rows: readonly Row[]): Readonly<Record<string, number>> {
  return Object.fromEntries(SEED_RULES.map((rule) => [rule, rows.filter((row) => row.code === `zgeoff(${rule})`).length]));
}

export function formatSeedCounts(counts: Readonly<Record<string, number>>): string {
  return `seed rules: ${SEED_RULES.map((rule) => `${rule} ${counts[rule] ?? 0}`).join(', ')}`;
}

const PATHS = ['src', 'test', 'scripts'];

function readRows(): readonly Row[] {
  const result = spawnSync('bunx', ['oxlint', '--format', 'json', ...PATHS], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error !== undefined) {
    throw result.error;
  }
  return parseOxlintReport(result.status, result.stdout, result.stderr);
}

// Exit 2 on a broken run, so it never reads as exit 1, a check that found seed-rule findings.
if (import.meta.main) {
  try {
    process.exit(checkSeeds(readRows()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(2);
  }
}
