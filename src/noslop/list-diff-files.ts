import type { Runner } from '../runner/types.ts';

// The paths a diff from `from` to `to` touches, or null when git cannot list them. A rename counts
// as its old and its new path.
export async function listDiffFiles(run: Runner, directory: string, from: string, to: string): Promise<string[] | null> {
  const result = await run(['git', '-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', '-z', from, to], { cwd: directory });
  return result.code === 0 ? result.stdout.split('\0').filter((path) => path !== '') : null;
}
