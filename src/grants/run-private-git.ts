import { HqError } from '../errors.ts';

// One read-only git command in the hq-private clone; a failure throws with git's own words.
export function runPrivateGit(directory: string, args: string[]): string {
  const run = Bun.spawnSync(['git', '-C', directory, ...args], { timeout: 30_000 });
  if (run.exitCode !== 0) {
    throw new HqError('bad_grants', `git ${args[0]} in ${directory} failed: ${run.stderr.toString().trim().slice(0, 200)}`);
  }
  return run.stdout.toString();
}
