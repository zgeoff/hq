import { spawnSync } from 'node:child_process';
import { z } from 'zod';

const rowSchema = z.object({ code: z.string() });
const reportSchema = z.object({ diagnostics: z.array(rowSchema) });

interface Row {
  readonly code: string;
}

interface Counts {
  readonly casts: number;
  readonly unsafe: number;
  readonly unsafeByRule: Readonly<Record<string, number>>;
}

const CAST_CODE = 'typescript(consistent-type-assertions)';
const UNSAFE_PREFIX = 'typescript(no-unsafe-';
const UNSAFE_RULES = ['assignment', 'member-access', 'argument', 'call', 'return'] as const;
const PATHS = ['src', 'test', 'scripts'];

export function collectCounts(plain: readonly Row[], typeAware: readonly Row[]): Counts {
  const unsafeByRule: Record<string, number> = {};
  for (const rule of UNSAFE_RULES) {
    unsafeByRule[rule] = typeAware.filter((row) => row.code === `${UNSAFE_PREFIX}${rule})`).length;
  }
  return {
    casts: plain.filter((row) => row.code === CAST_CODE).length,
    unsafe: Object.values(unsafeByRule).reduce((sum, count) => sum + count, 0),
    unsafeByRule,
  };
}

export function formatCounts(counts: Counts): string[] {
  const breakdown = UNSAFE_RULES.map((rule) => `${rule} ${counts.unsafeByRule[rule] ?? 0}`).join(', ');
  return [`casts: ${counts.casts}`, `no-unsafe: ${counts.unsafe} (${breakdown})`];
}

function readRows(args: readonly string[]): readonly Row[] {
  const result = spawnSync('bunx', ['oxlint', '--format', 'json', ...args, ...PATHS], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error !== undefined) {
    throw result.error;
  }
  return reportSchema.parse(JSON.parse(result.stdout)).diagnostics;
}

export function runCheckCasts(): number {
  const unsafeFlags = UNSAFE_RULES.flatMap((rule) => ['-D', `typescript/no-unsafe-${rule}`]);
  const counts = collectCounts(readRows([]), readRows(['--type-aware', '-A', 'all', ...unsafeFlags]));
  for (const line of formatCounts(counts)) {
    console.log(line);
  }
  if (counts.casts === 0 && counts.unsafe === 0) {
    return 0;
  }
  return 1;
}

if (import.meta.main) {
  process.exit(runCheckCasts());
}
