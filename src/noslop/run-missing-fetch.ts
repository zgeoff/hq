import type { Runner } from '../runner/types.ts';

// Fetches from origin each commit the checkout lacks; false when one stays missing.
export async function runMissingFetch(run: Runner, directory: string, shas: readonly string[]): Promise<boolean> {
  const unique = [...new Set(shas)];
  const checks = await Promise.all(unique.map((sha) => run(['git', 'cat-file', '-e', `${sha}^{commit}`], { cwd: directory })));
  const missing = unique.filter((_sha, index) => checks[index]?.code !== 0);
  if (missing.length === 0) {
    return true;
  }
  const fetched = await run(['git', 'fetch', '-q', 'origin', ...missing], { cwd: directory });
  return fetched.code === 0;
}
