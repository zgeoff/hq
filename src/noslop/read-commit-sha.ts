import type { Runner } from '../runner/types.ts';
import { GitReadError } from './git-read-error.ts';

// The full sha of the one commit `rev` names, or null when the repo holds none, or the prefix names
// more than one. `rev-parse --verify -q` exits 1 for that; any other failed exit is no answer.
export async function readCommitSha(run: Runner, dir: string, rev: string): Promise<string | null> {
  const parsed = await run(['git', 'rev-parse', '--verify', '-q', `${rev}^{commit}`], { cwd: dir });
  if (parsed.code === 1) {
    return null;
  }
  if (parsed.code !== 0 || parsed.stdout.trim() === '') {
    throw new GitReadError(`git cannot read the commit ${rev.slice(0, 7)}: ${(parsed.stderr || parsed.stdout).trim().slice(0, 300)}`);
  }
  return parsed.stdout.trim();
}
