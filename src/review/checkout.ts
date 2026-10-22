import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config/config.ts';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { repoCache } from './repo-cache.ts';
import { runCommand } from './run-command.ts';
import { withPidLock } from './with-pid-lock.ts';

// A checkout to make the worktree from: --repo-dir, else ~/projects/<repo> when its
// origin is the repo, else hq's own clone (made on first use).
export async function checkout(run: Runner, slug: string, repo: string, repoDir?: string): Promise<string> {
  if (repoDir) {
    if (!existsSync(repoDir)) throw new HqError('bad_args', `--repo-dir ${repoDir} does not exist`);
    if (!(await originIs(run, repoDir, slug))) throw new HqError('bad_args', `--repo-dir ${repoDir} is not a checkout of ${slug}`);
    return repoDir;
  }
  const local = `${projectsDir()}/${repo}`;
  if (existsSync(local) && (await originIs(run, local, slug))) return local;
  const cached = `${repoCache()}/${slug}`;
  await ensureCachedClone(run, slug, cached);
  return cached;
}

async function originIs(run: Runner, dir: string, slug: string): Promise<boolean> {
  const r = await run(['git', 'remote', 'get-url', 'origin'], { cwd: dir });
  if (r.code !== 0) return false;
  const url = r.stdout.trim().replace(/\.git$/, '').toLowerCase();
  return url.endsWith(`github.com/${slug.toLowerCase()}`) || url.endsWith(`github.com:${slug.toLowerCase()}`);
}

function projectsDir(): string {
  return config().HQ_PROJECTS ?? `${process.env['HOME']}/projects`;
}

// The cache check and the clone run under one lock on the repo's clone, so two first reviews never
// clone into one folder, and no review gets the folder before its clone is complete.
async function ensureCachedClone(run: Runner, slug: string, cached: string): Promise<void> {
  mkdirSync(dirname(cached), { recursive: true });
  await withPidLock(
    `${cached}.lock`,
    `a clone of ${slug}`,
    async () => {
      if (!existsSync(cached)) {
        await runCommand(run, ['gh', 'repo', 'clone', slug, cached, '--', '-q']);
      }
    },
    config().HQ_REVIEW_LOCK_WAIT_MS,
  );
}
