import { existsSync } from 'node:fs';
import { config } from '../config/config.ts';
import type { TreeName } from '../prompts/trees.ts';
import { TREES } from '../prompts/trees.ts';
import { isContention } from './is-contention.ts';
import { originMatches } from './origin-matches.ts';
import { readOrigin } from './read-origin.ts';
import { shouldReattach } from './should-reattach.ts';
import type { ReattachFacts } from './should-reattach.ts';
import type { TreeSync } from './types.ts';

const LOCK_WAIT_S = 30;

interface GitResult {
  code: number | null;
  err: string;
  out: string;
}

type Git = (...args: string[]) => GitResult;

interface Checkout {
  at: string;
  dir: string;
  git: Git;
}

// z-stu (2026-10-16): hq keeps hq-defs' working tree on origin/main, since sessions read skills
// there, and hq-private's too. Only a fast-forward, after putting a clean detached HEAD back on main:
// a dirty tree, another branch, or local commits are refused, never reset.
export function runTreeSync(tree: TreeName = 'hq'): TreeSync | null {
  const dir = TREES[tree].dir();

  // Not set up: nothing to keep.
  return existsSync(`${dir}/.git`) ? runCheckoutSync(dir, TREES[tree].repo) : null;
}

function runCheckoutSync(dir: string, repo: string): TreeSync {
  const at = new Date().toISOString(),
    git = makeGit(dir),
    origin = readOrigin(dir);
  if (!originMatches(origin, repo)) {
    return buildRefusal({ at, dir, git }, `origin is ${origin ?? 'not set'}, not ${repo}`);
  }
  return runFetchAndForward({ at, dir, git });
}

// hq's own git calls take one flock (in .git, so it goes where the checkout goes), so the
// watcher and a hand-run `hq defs sync` never race on a ref. flock -o drops its lock fd before
// the command runs, so the lock dies with flock; `timeout` ends a hung git.
function makeGit(dir: string): Git {
  return (...args) => {
    const gitMs = config().HQ_SYNC_GIT_TIMEOUT_MS,
      result = Bun.spawnSync(buildLockedGit(dir, gitMs, args), {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        timeout: LOCK_WAIT_S * 1000 + gitMs + 10_000,
      });
    return { code: result.exitCode, err: result.stderr.toString().trim(), out: result.stdout.toString().trim() };
  };
}

function buildRefusal(checkout: Checkout, why: string): TreeSync {
  return { at: checkout.at, ok: false, changed: false, line: `${checkout.dir}: ${why}; not fast-forwarded` };
}

function runFetchAndForward(checkout: Checkout): TreeSync {
  return runForwardAfterFetch(checkout, runFetch(checkout.git));
}

function runForwardAfterFetch(checkout: Checkout, fetched: GitResult): TreeSync {
  if (fetched.code !== 0 && isContention(fetched.err)) {
    return {
      at: checkout.at,
      ok: true,
      changed: false,
      transient: true,
      line: `${checkout.dir}: another git holds a ref lock; left for the next tick (${fetched.err.slice(0, 120)})`,
    };
  }
  if (fetched.code !== 0) {
    return buildRefusal(checkout, `git fetch failed (${fetched.code}): ${fetched.err.slice(0, 200)}`);
  }
  return runForwardUnlessBlocked(checkout);
}

function runForwardUnlessBlocked(checkout: Checkout): TreeSync {
  const reattached = runReattach(checkout.git);
  const blocker = readBlocker(checkout.git);
  const result = blocker ? buildRefusal(checkout, blocker) : runFastForward(checkout);
  return reattached ? { ...result, reattached, line: `re-attached to main from detached ${reattached}; ${result.line}` } : result;
}

function runReattach(git: Git): string | null {
  const head = readSha(git, 'HEAD');
  if (!head || !shouldReattach(readReattachFacts(git))) {
    return null;
  }
  return git('switch', '-q', 'main').code === 0 ? head.slice(0, 7) : null;
}

function readReattachFacts(git: Git): ReattachFacts {
  const status = git('status', '--porcelain', '--untracked-files=no');
  return {
    onBranch: git('symbolic-ref', '-q', '--short', 'HEAD').out !== '',
    hasOriginMain: readSha(git, 'origin/main') !== null,
    clean: status.code === 0 && status.out === '',
    headOnOriginMain: git('merge-base', '--is-ancestor', 'HEAD', 'origin/main').code === 0,
    hasLocalMain: readSha(git, 'refs/heads/main') !== null,
    localMainOnOriginMain: git('merge-base', '--is-ancestor', 'main', 'origin/main').code === 0,
  };
}

// An explicit refspec: a clone whose configured refspec skips main would leave origin/main old.
function runFetch(git: Git): GitResult {
  const first = git('fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main');
  if (first.code === 0 || !isContention(first.err)) {
    return first;
  }
  Bun.sleepSync(config().HQ_REF_LOCK_RETRY_MS);
  return git('fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main');
}

function readBlocker(git: Git): string | null {
  const branch = git('symbolic-ref', '-q', '--short', 'HEAD').out;
  return branch === 'main' ? readDirtiness(git) : formatBranchBlocker(branch);
}

function formatBranchBlocker(branch: string): string {
  return branch ? `on branch ${branch}, not main` : 'HEAD is detached';
}

function readDirtiness(git: Git): string | null {
  const status = git('status', '--porcelain', '--untracked-files=no');
  if (status.code !== 0) {
    return `git status failed (${status.code}): ${status.err.slice(0, 200)}`;
  }
  return status.out ? `dirty (${status.out.split('\n').length} changed file(s))` : null;
}

function readSha(git: Git, ref: string): string | null {
  const result = git('rev-parse', '--verify', '-q', `${ref}^{commit}`);
  return result.code === 0 && /^[0-9a-f]{40,64}$/u.test(result.out) ? result.out : null;
}

function runFastForward(checkout: Checkout): TreeSync {
  const head = readSha(checkout.git, 'HEAD'),
    main = readSha(checkout.git, 'origin/main');
  if (!head || !main) {
    return buildRefusal(checkout, `can't resolve ${head ? 'origin/main' : 'HEAD'}`);
  }
  if (head === main) {
    return { at: checkout.at, ok: true, changed: false, line: `${checkout.dir} is on origin/main ${main.slice(0, 7)}` };
  }
  if (checkout.git('merge-base', '--is-ancestor', 'HEAD', 'origin/main').code !== 0) {
    return buildRefusal(checkout, `main ${head.slice(0, 7)} has commits origin/main ${main.slice(0, 7)} lacks`);
  }
  return merge(checkout, `${head.slice(0, 7)} → ${main.slice(0, 7)}`);
}

function merge(checkout: Checkout, moved: string): TreeSync {
  const merged = checkout.git('merge', '-q', '--ff-only', 'origin/main');
  if (merged.code !== 0) {
    return buildRefusal(checkout, `git merge --ff-only failed (${merged.code}): ${(merged.err || merged.out).slice(0, 200)}`);
  }
  return { at: checkout.at, ok: true, changed: true, line: `${checkout.dir} fast-forwarded ${moved}` };
}

function buildLockedGit(dir: string, gitMs: number, args: string[]): string[] {
  return ['flock', '-o', '-w', String(LOCK_WAIT_S), `${dir}/.git/hq-sync.lock`, 'timeout', '-k', '5', `${gitMs / 1000}s`, 'git', '-C', dir, ...args];
}
