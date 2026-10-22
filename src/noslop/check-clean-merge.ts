import type { Runner } from '../runner/types.ts';
import { GitReadError } from './git-read-error.ts';

// Whether a commit is a clean merge: two parents, and its tree is the one git's own merge of them
// writes with no conflict, so it holds no conflict resolution and no hand edit. Throws GitReadError
// when git cannot answer.
export async function checkCleanMerge(run: Runner, dir: string, sha: string): Promise<boolean> {
  const listed = await run(['git', 'rev-list', '--parents', '-n', '1', sha], { cwd: dir }),
    [, first = '', second = '', ...more] = listed.stdout.trim().split(/\s+/u);
  if (listed.code !== 0 || listed.stdout.trim() === '') {
    throw new GitReadError(`git cannot read the parents of ${sha.slice(0, 7)}: ${(listed.stderr || listed.stdout).trim().slice(0, 300)}`);
  }
  if (first === '' || second === '' || more.length > 0) {
    return false;
  }
  return await checkMergeTree(run, dir, sha, [first, second]);
}

// `git merge-tree` exits 1 for a merge with conflicts, which is an answer; any other non-0 exit is not.
async function checkMergeTree(run: Runner, dir: string, sha: string, parents: [string, string]): Promise<boolean> {
  const merged = await run(['git', 'merge-tree', '--write-tree', ...parents], { cwd: dir }),
    mergedTree = merged.stdout.split('\n', 1)[0]?.trim() ?? '',
    tree = await run(['git', 'rev-parse', `${sha}^{tree}`], { cwd: dir });
  if (merged.code !== 0 && merged.code !== 1) {
    throw new GitReadError(`git cannot merge the parents of ${sha.slice(0, 7)}: ${(merged.stderr || merged.stdout).trim().slice(0, 300)}`);
  }
  if (tree.code !== 0 || tree.stdout.trim() === '') {
    throw new GitReadError(`git cannot read the tree of ${sha.slice(0, 7)}: ${(tree.stderr || tree.stdout).trim().slice(0, 300)}`);
  }
  return merged.code === 0 && mergedTree !== '' && mergedTree === tree.stdout.trim();
}
