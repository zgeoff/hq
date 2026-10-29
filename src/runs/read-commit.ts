import { cleanEnv } from '../runner/clean-env.ts';
import { toRunFailure } from '../runner/to-run-failure.ts';
import type { Runner } from '../runner/types.ts';
import type { CommitRead } from './types.ts';

// GitHub answers 404 for a sha it has no commit for, and 422 for one it cannot tell apart.
const NOT_FOUND = /HTTP (?:404|422)/u;

// The full sha GitHub resolves a short sha to in the PR's repo.
export async function readCommit(run: Runner, ref: string, sha: string): Promise<CommitRead> {
  const [repo = ''] = ref.split('#');
  const result = await run(['gh', 'api', `repos/zgeoff/${repo}/commits/${sha}`, '--jq', '.sha'], { env: cleanEnv() }).catch(toRunFailure);
  const text = (result.stderr || result.stdout).trim();
  if (result.code !== 0) {
    return NOT_FOUND.test(text) ? { kind: 'missing' } : { kind: 'fault', reason: text.slice(0, 200) || `gh exited ${result.code}` };
  }
  const full = result.stdout.trim();
  return /^[0-9a-f]{40}$/iu.test(full) ? { kind: 'found', sha: full } : { kind: 'fault', reason: `unexpected answer: ${full.slice(0, 80)}` };
}
