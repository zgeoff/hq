import { existsSync } from 'node:fs';
import { HqError } from '../errors.ts';
import { PRIVATE_TREE } from './private-tree.ts';
import { runMainFetch } from './run-main-fetch.ts';

// A file as it stands on origin/main of hq-private, after a fetch, never from the working tree.
// There is no fallback to another checkout: a missing file, clone or fetch is a refusal.
export function readPrivateMain(rel: string, quick: boolean): string {
  const dir = PRIVATE_TREE.dir();
  if (!existsSync(`${dir}/.git`)) {
    throw new HqError('no_prompt', `can't read ${rel}: ${dir} is not a checkout (hq defs setup private); hq refuses to use the working tree or an old fetch`);
  }
  return readShownMain(dir, rel, runMainFetch(dir, quick));
}

function readShownMain(dir: string, rel: string, fetchError: string | null): string {
  if (fetchError) {
    throw new HqError('no_prompt', `can't fetch main in ${dir} to read ${rel}: ${fetchError}; hq refuses to use the working tree or an old fetch`);
  }
  return readShown(dir, rel);
}

function readShown(dir: string, rel: string): string {
  const shown = Bun.spawnSync(['git', '-C', dir, 'show', `origin/main:${rel}`], { timeout: 30_000 });
  if (shown.exitCode !== 0) {
    throw new HqError('no_prompt', `can't read ${rel} from origin/main in ${dir}: ${shown.stderr.toString().trim().slice(0, 200)}; hq refuses to use the working tree`);
  }
  return shown.stdout.toString();
}
