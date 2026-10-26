import type { Runner } from '../runner/types.ts';

// git's patch-id of the PR's own diff: from the merge base of base and head to head. --verbatim keeps
// whitespace, so a change of indentation alone changes the id. Null when git cannot read the diff
// or the diff is empty.
export async function readPRPatchID(run: Runner, directory: string, base: string, head: string): Promise<string | null> {
  const mergeBase = await run(['git', 'merge-base', base, head], { cwd: directory });
  if (mergeBase.code !== 0) {
    return null;
  }
  const diff = await run(['git', 'diff', '--binary', '--full-index', mergeBase.stdout.trim(), head], { cwd: directory });
  if (diff.code !== 0 || diff.stdout === '') {
    return null;
  }
  const patch = await run(['git', 'patch-id', '--verbatim'], { cwd: directory, stdin: diff.stdout });
  const id = patch.stdout.trim().split(/\s+/u)[0] ?? '';
  return patch.code === 0 && id !== '' ? id : null;
}
