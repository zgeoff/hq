import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { parseJSON } from '../src/noslop/parse-json.ts';
import { TYPE_AWARE_ARGS, UNSAFE_PREFIX, UNSAFE_RULES } from './unsafe-rules.ts';

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

export function parseOxlintReport(status: number | null, stdout: string, stderr: string): readonly Row[] {
  const parsed = reportSchema.safeParse(parseJSON(stdout));
  if (!parsed.success) {
    throw new Error(`oxlint exited ${status ?? 'on a signal'} with no JSON report: ${stderr.trim().slice(-500) || 'no stderr'}`);
  }
  return parsed.data.diagnostics;
}

export function readRows(args: readonly string[]): readonly Row[] {
  const result = spawnSync('bunx', ['oxlint', '--format', 'json', ...args, ...PATHS], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error !== undefined) {
    throw result.error;
  }
  return parseOxlintReport(result.status, result.stdout, result.stderr);
}

export function runCheckCasts(): number {
  const counts = collectCounts(readRows([]), readRows(TYPE_AWARE_ARGS));
  for (const line of formatCounts(counts)) {
    console.log(line);
  }
  if (counts.casts === 0 && counts.unsafe === 0) {
    return 0;
  }
  return 1;
}

// Exit 2 on a broken run, so it never reads as exit 1, a check that counted casts.
if (import.meta.main) {
  try {
    process.exit(runCheckCasts());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(2);
  }
}
