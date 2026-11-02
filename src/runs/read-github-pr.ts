import { cleanEnv } from '../runner/clean-env.ts';
import type { Runner } from '../runner/types.ts';
import { parseGitHubPR } from './parse-github-pr.ts';
import type { GitHubPr } from './parse-github-pr.ts';

export async function readGitHubPR(run: Runner, ref: string): Promise<GitHubPr | { error: string }> {
  const [repo = '', number = ''] = ref.split('#');
  const view = await run(['gh', 'pr', 'view', number, '-R', `zgeoff/${repo}`, '--json', 'state,mergedAt,mergeCommit'], { env: cleanEnv() });
  return parseGitHubPR(ref, view);
}
