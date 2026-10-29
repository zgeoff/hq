import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { realRunner } from '../src/runner/real-runner.ts';
import { createStubPRRepo } from './create-stub-pr-repo.ts';

// A commit's files: a path to its text.
type Files = Record<string, string>;

interface StubRebaseRepoOptions {
  root: string;
  repo: string;
  pr: number;
  history: Files[];
  change: Files;
}

interface StubRebaseRepo {
  directory: string;

  // The PR head before anything moves.
  oldHead: string;

  // One more commit on main, pushed.
  moveMain: (files: Files) => Promise<void>;

  // Replays the PR commit on main as it is now, adds `edit` to that commit, and serves the result as
  // the PR head. Gives the new head.
  rebase: (edit?: Files) => Promise<string>;

  // Squashes the PR onto main as it is now into one commit, serves it as the PR head and gives it.
  squash: () => Promise<string>;

  // The head origin serves for the PR now.
  readServedHead: () => Promise<string>;
}

// A stub PR repo (see createStubPRRepo) whose PR head can then be rebased or squashed onto a main
// that has moved, as a force push to the PR branch would.
export async function createStubRebaseRepo(options: StubRebaseRepoOptions): Promise<StubRebaseRepo> {
  const stub = await createStubPRRepo({ root: options.root, repo: options.repo, pr: options.pr, history: options.history, change: options.change });
  const git = (...args: string[]) => runGit(stub.directory, args);
  const serve = async (): Promise<string> => {
    const head = await git('rev-parse', 'HEAD');
    await git('push', '-q', '--force', 'origin', `HEAD:refs/pull/${options.pr}/head`);
    return head;
  };
  return {
    directory: stub.directory,
    oldHead: stub.head,
    moveMain: async (files) => {
      await git('checkout', '-q', 'main');
      writeFiles(stub.directory, files);
      await git('add', '-A');
      await git('commit', '-q', '-m', 'main moves on');
      await git('push', '-q', 'origin', 'main');
    },
    rebase: async (edit) => {
      await git('checkout', '-q', 'kettle-edit');
      await git('rebase', '-q', 'main');
      if (edit !== undefined) {
        writeFiles(stub.directory, edit);
        await git('add', '-A');
        await git('commit', '-q', '--amend', '--no-edit');
      }
      return await serve();
    },
    readServedHead: async () => {
      const served = await git('ls-remote', 'origin', `refs/pull/${options.pr}/head`);
      return served.split('\t')[0] ?? '';
    },
    squash: async () => {
      await git('checkout', '-q', '-B', 'kettle-squash', 'main');
      await git('merge', '-q', '--squash', 'kettle-edit');
      await git('commit', '-q', '-m', 'the PR change, squashed');
      return await serve();
    },
  };
}

async function runGit(directory: string, args: string[]): Promise<string> {
  const result = await realRunner(['git', '-c', 'user.name=Kettle', '-c', 'user.email=kettle@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: directory });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function writeFiles(directory: string, files: Files): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
}
