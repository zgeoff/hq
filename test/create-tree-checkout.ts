import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TreeName } from '../src/prompts/trees.ts';
import { TREES } from '../src/prompts/trees.ts';

// The subject and time of a commit to origin; each defaults when left out.
interface CommitShape {
  subject?: string;
  at?: string;
}

interface TreeCheckout {
  dir: string;
  git: (...args: string[]) => string;
  origin: string;
  writeCommit: (files: Record<string, string>, commit?: CommitShape) => void;
}

// A checkout of one tree at its directory, cloned from a local origin under `root`. Its remote
// reads as the one gh sets; insteadOf sends the fetch to the local origin.
export function createTreeCheckout(root: string, tree: TreeName, files: Record<string, string>): TreeCheckout {
  const dir = TREES[tree].dir(),
    origin = join(root, `${tree}-origin`),
    remote = `git@github.com:${TREES[tree].repo}.git`,
    writeCommit = (next: Record<string, string>, commit: CommitShape = {}) => {
      for (const [path, text] of Object.entries(next)) {
        mkdirSync(dirname(join(origin, path)), { recursive: true });
        writeFileSync(join(origin, path), text);
      }
      runGit(origin, 'add', '-A');
      runGit({ cwd: origin, at: commit.at }, 'commit', '-q', '-m', commit.subject ?? 'invented change');
    };
  mkdirSync(origin, { recursive: true });
  runGit(origin, 'init', '-q', '-b', 'main');
  writeCommit(files);
  mkdirSync(dirname(dir), { recursive: true });
  runGit(root, 'clone', '-q', origin, dir);
  runGit(dir, 'remote', 'set-url', 'origin', remote);
  runGit(dir, 'config', `url.${origin}.insteadOf`, remote);
  return { dir, git: (...args) => runGit(dir, ...args), origin, writeCommit };
}

interface DatedPlace {
  cwd: string;
  at?: string | undefined;
}

// A place given with `at` makes a commit there carry that time as both its author and commit time.
function runGit(place: string | DatedPlace, ...args: string[]): string {
  const dated: DatedPlace = typeof place === 'string' ? { cwd: place } : place;
  const env = dated.at === undefined ? process.env : { ...process.env, GIT_AUTHOR_DATE: dated.at, GIT_COMMITTER_DATE: dated.at };
  const run = Bun.spawnSync(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dated.cwd, env });
  if (run.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')}: ${run.stderr.toString()}`);
  }
  return run.stdout.toString().trim();
}
