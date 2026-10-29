import { cleanEnv } from '../runner/clean-env.ts';
import { toRunFailure } from '../runner/to-run-failure.ts';
import type { Runner } from '../runner/types.ts';
import type { CommitsRead } from './types.ts';

// Every commit sha of the PR, oldest first, in one paged read.
export async function readPRCommits(run: Runner, ref: string): Promise<CommitsRead> {
  const [repo = '', number = ''] = ref.split('#');
  const result = await run(['gh', 'api', `repos/zgeoff/${repo}/pulls/${number}/commits`, '--paginate', '--jq', '.[].sha'], { env: cleanEnv() }).catch(toRunFailure);
  if (result.code !== 0) {
    return { kind: 'fault', reason: (result.stderr || result.stdout).trim().slice(0, 200) || `gh exited ${result.code}` };
  }
  return { kind: 'listed', shas: result.stdout.split('\n').filter((line) => /^[0-9a-f]{40}$/iu.test(line.trim())).map((line) => line.trim()) };
}
