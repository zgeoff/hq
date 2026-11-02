import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { realRunner } from '../src/runner/real-runner.ts';

type Commit = Record<string, string | null>;

interface StubPRRepoOptions {
  root: string;
  repo: string;
  pr: number;
  history: Commit[];
  change: Commit;

  baseAfter?: Commit;
}

interface StubPRRepo {
  directory: string;
  head: string;
  baseHead: string;
}

export async function createStubPRRepo(options: StubPRRepoOptions): Promise<StubPRRepo> {
  const bare = join(options.root, 'remotes', `${options.repo}.git`);
  const directory = join(options.root, 'projects', options.repo);
  const url = `https://github.com/zgeoff/${options.repo}.git`;
  mkdirSync(bare, { recursive: true });
  mkdirSync(directory, { recursive: true });
  await runGit(bare, ['init', '-q', '--bare', '-b', 'main']);
  await runGit(directory, ['init', '-q', '-b', 'main']);
  await runGit(directory, ['remote', 'add', 'origin', url]);
  await runGit(directory, ['config', `url.${bare}.insteadOf`, url]);
  for (const [index, files] of options.history.entries()) {
    await writeCommit(directory, files, `history ${index}`);
  }
  await runGit(directory, ['checkout', '-q', '-b', 'kettle-edit']);
  await writeCommit(directory, options.change, 'the PR change');
  const head = await runGit(directory, ['rev-parse', 'HEAD']);
  await runGit(directory, ['push', '-q', 'origin', `HEAD:refs/pull/${options.pr}/head`]);
  await runGit(directory, ['checkout', '-q', 'main']);
  if (options.baseAfter !== undefined) {
    await writeCommit(directory, options.baseAfter, 'main moves on');
  }
  await runGit(directory, ['push', '-q', 'origin', 'main']);
  return { directory, head, baseHead: await runGit(directory, ['rev-parse', 'main']) };
}

async function runGit(directory: string, args: string[]): Promise<string> {
  const result = await realRunner(['git', '-c', 'user.name=Kettle', '-c', 'user.email=kettle@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: directory });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function writeCommit(directory: string, files: Commit, message: string): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) {
      rmSync(join(directory, path), { force: true });
    } else {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), text);
    }
  }
  await runGit(directory, ['add', '-A']);
  await runGit(directory, ['commit', '-q', '--allow-empty', '-m', message]);
}
