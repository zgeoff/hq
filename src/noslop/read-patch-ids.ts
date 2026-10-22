import type { Runner } from '../runner/types.ts';
import { GitReadError } from './git-read-error.ts';

// Each commit's patch id by its sha, as git's `patch-id --stable` gives it, which stays the same
// across file order and whitespace. A commit with no patch, such as an empty one, gets none. Throws
// GitReadError when git cannot answer. The commits must not be merges.
export async function readPatchIDs(run: Runner, dir: string, shas: readonly string[]): Promise<Map<string, string>> {
  if (shas.length === 0) {
    return new Map();
  }
  const shown = await run(['git', 'show', '--no-color', '--no-ext-diff', '--no-textconv', '--format=commit %H', '--patch', ...shas], { cwd: dir });
  if (shown.code !== 0) {
    throw new GitReadError(`git cannot read the patches of ${shas.length} commit(s): ${(shown.stderr || shown.stdout).trim().slice(0, 300)}`);
  }
  return await readPrintedIDs(run, dir, shown.stdout, shas.length);
}

async function readPrintedIDs(run: Runner, dir: string, patches: string, count: number): Promise<Map<string, string>> {
  const printed = await run(['git', 'patch-id', '--stable'], { cwd: dir, stdin: `${patches}\n` });
  if (printed.code !== 0) {
    throw new GitReadError(`git cannot give the patch ids of ${count} commit(s): ${(printed.stderr || printed.stdout).trim().slice(0, 300)}`);
  }
  return new Map(
    printed.stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const [id = '', sha = ''] = line.trim().split(/\s+/u);
        return [sha, id] as const;
      }),
  );
}
