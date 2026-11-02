import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TreeName } from '../src/prompts/trees.ts';
import { TREES } from '../src/prompts/trees.ts';

interface CommitShape {
  subject?: string;
  at?: string;
}

interface TreeCheckout {
  directory: string;
  git: (...args: string[]) => string;
  origin: string;
  writeCommit: (files: Record<string, string>, commit?: CommitShape) => void;
}

export function createTreeCheckout(root: string, tree: TreeName, files: Record<string, string>): TreeCheckout {
  const directory = TREES[tree].dir();
  const origin = join(root, `${tree}-origin`);
  const remote = `git@github.com:${TREES[tree].repo}.git`;
  const writeCommit = (next: Record<string, string>, commit: CommitShape = {}) => {
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
  mkdirSync(dirname(directory), { recursive: true });
  runGit(root, 'clone', '-q', origin, directory);
  runGit(directory, 'remote', 'set-url', 'origin', remote);
  runGit(directory, 'config', `url.${origin}.insteadOf`, remote);
  return { directory, git: (...args) => runGit(directory, ...args), origin, writeCommit };
}

interface DatedPlace {
  cwd: string;
  at?: string | undefined;
}

function runGit(place: string | DatedPlace, ...args: string[]): string {
  const dated: DatedPlace = typeof place === 'string' ? { cwd: place } : place;
  const env = dated.at === undefined ? process.env : { ...process.env, GIT_AUTHOR_DATE: dated.at, GIT_COMMITTER_DATE: dated.at };
  const run = Bun.spawnSync(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dated.cwd, env });
  if (run.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')}: ${run.stderr.toString()}`);
  }
  return run.stdout.toString().trim();
}
