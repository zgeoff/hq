import { spawnSync } from 'node:child_process';

// True when the merge base of HEAD and `base` holds no package.json: the branch imports the whole
// tree into an empty repo, so none of its lines is a change to code lint:changed ever read. A git
// failure throws, so the lint never skips on an error.
export function probeImportBase(base: string, cwd: string = process.cwd()): boolean {
  const mergeBase = runGit(['merge-base', 'HEAD', base], cwd).trim();
  const listed = runGit(['ls-tree', '--name-only', mergeBase, '--', 'package.json'], cwd);
  return listed.trim() === '';
}

function runGit(args: string[], cwd: string): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${result.status}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}
