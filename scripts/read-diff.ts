import { spawnSync } from 'node:child_process';

// The branch's TypeScript diff against its base, with no context lines. Deleted files are in it, so
// the lines a split moves out of a deleted file count as moved.
export function readDiff(base: string, cwd: string = process.cwd()): string {
  const result = spawnSync('git', ['diff', '--unified=0', '--no-color', '--diff-filter=AMRD', '--merge-base', base, '--', '*.ts', '*.tsx'], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result.stdout;
}
