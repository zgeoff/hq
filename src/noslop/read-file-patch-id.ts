import type { Runner } from '../runner/types.ts';
import type { DiffEnd } from './diff-end.ts';

// git's patch-id of one file's diff from `from` to `to`: '' when the file does not change, null when
// git cannot read the diff.
export async function readFilePatchID(run: Runner, directory: string, range: DiffEnd, path: string): Promise<string | null> {
  const diff = await run(['git', '--literal-pathspecs', 'diff', '--binary', '--full-index', range.from, range.to, '--', path], { cwd: directory });
  if (diff.code !== 0) {
    return null;
  }
  if (diff.stdout === '') {
    return '';
  }
  const patch = await run(['git', 'patch-id', '--verbatim'], { cwd: directory, stdin: diff.stdout });
  const id = patch.stdout.trim().split(/\s+/u)[0] ?? '';
  return patch.code === 0 && id !== '' ? id : null;
}
