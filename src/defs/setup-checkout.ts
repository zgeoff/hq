import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { HqError } from '../errors.ts';
import type { TreeName } from '../prompts/trees.ts';
import { TREES } from '../prompts/trees.ts';
import type { Runner } from '../runner/types.ts';

// A clone of the tree's repo, if there is none yet. hq-defs' working tree is where the fleet
// sessions run; start prompts are read from hq-private's origin/main.
export async function setupCheckout(run: Runner, tree: TreeName): Promise<{ dir: string; made: boolean }> {
  const dir = TREES[tree].dir();
  if (existsSync(`${dir}/.git`)) {
    return { dir, made: false };
  }
  if (existsSync(dir)) {
    throw new HqError('exists', `${dir} exists and is not a git checkout; move it aside first`);
  }
  mkdirSync(dirname(dir), { recursive: true });
  await runClone(run, TREES[tree].repo, dir);
  return { dir, made: true };
}

async function runClone(run: Runner, repo: string, dir: string): Promise<void> {
  const cloned = await run(['gh', 'repo', 'clone', repo, dir, '--', '-q']);
  if (cloned.code !== 0) {
    throw new HqError('command_failed', `gh repo clone ${repo} failed (${cloned.code}): ${(cloned.stderr || cloned.stdout).trim().slice(0, 300)}`);
  }
}
