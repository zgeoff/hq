import type { Runner } from '../runner/types.ts';
import { GitReadError } from './git-read-error.ts';

// `git merge-base --is-ancestor` exits 0 for yes and 1 for no; any other exit is no answer.
export async function readIsAncestor(run: Runner, dir: string, parent: string, base: string): Promise<boolean> {
  const result = await run(['git', 'merge-base', '--is-ancestor', parent, base], { cwd: dir });
  if (result.code !== 0 && result.code !== 1) {
    throw new GitReadError(`git cannot tell whether ${parent.slice(0, 7)} is in ${base}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
  }
  return result.code === 0;
}
