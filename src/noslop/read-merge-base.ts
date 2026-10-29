import type { Runner } from '../runner/types.ts';

// The merge base of two commits, or null when git finds none.
export async function readMergeBase(run: Runner, directory: string, base: string, head: string): Promise<string | null> {
  const result = await run(['git', 'merge-base', base, head], { cwd: directory });
  const sha = result.stdout.trim();
  return result.code === 0 && sha !== '' ? sha : null;
}
