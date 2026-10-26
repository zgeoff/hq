import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { realRunner } from '../src/runner/real-runner.ts';

export interface GitRepo {
  directory: string;

  // Runs git in the repo and gives its trimmed output; a failure throws with git's own words.
  git: (...args: string[]) => Promise<string>;

  // Writes the files, commits them all, and gives the new commit's sha.
  commit: (files: Record<string, string>, message: string) => Promise<string>;
}

// An empty git repo on main at the directory, with an invented author and no signing.
export async function createGitRepo(directory: string): Promise<GitRepo> {
  mkdirSync(directory, { recursive: true });
  const git = async (...args: string[]): Promise<string> => {
    const result = await realRunner(['git', '-c', 'user.name=Kettle', '-c', 'user.email=kettle@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: directory });
    if (result.code !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  };
  const commit = async (files: Record<string, string>, message: string): Promise<string> => {
    for (const [path, text] of Object.entries(files)) {
      writeFileSync(join(directory, path), text);
    }
    await git('add', '-A');
    await git('commit', '-q', '-m', message);
    return await git('rev-parse', 'HEAD');
  };
  await git('init', '-q', '-b', 'main');
  return { directory, git, commit };
}
