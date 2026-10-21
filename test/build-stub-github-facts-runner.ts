import type { Runner } from '../src/runner/types.ts';

export interface StubGitHubFacts {
  // "repo#n" -> the stdout `gh pr view` prints for that PR. A PR not listed fails as gh does.
  views?: Record<string, string>;

  // The stdout the open `gh search prs` prints; left out, the search fails.
  search?: string;

  // The stdout the merged `gh search prs` (with --merged-at) prints; left out, it finds none.
  merged?: string;

  // Collects each command the runner saw.
  calls?: string[];

  // Runs when a `gh pr view` arrives, before it is answered.
  onView?: () => void;

  // Answers any other command; left out, those fail.
  fallback?: Runner;
}

// A runner for the GitHub facts pass: `gh pr view <n> -R zgeoff/<repo>` answers from `views`,
// the open `gh search prs` answers `search` and the merged one `merged`, and anything else, other `gh pr` commands included, goes to
// `fallback`, or fails.
export function buildStubGitHubFactsRunner(facts: StubGitHubFacts): Runner {
  return (cmd, opts) => {
    facts.calls?.push(cmd.join(' '));
    if (cmd[1] === 'search' && cmd.includes('--merged-at')) {
      return Promise.resolve({ code: 0, stdout: facts.merged ?? '[]', stderr: '' });
    }
    if (cmd[1] === 'search') {
      const searched = facts.search === undefined ? { code: 1, stdout: '', stderr: 'invented: search failed' } : { code: 0, stdout: facts.search, stderr: '' };
      return Promise.resolve(searched);
    }
    if (cmd[1] !== 'pr' || cmd[2] !== 'view') {
      if (facts.fallback) {
        return facts.fallback(cmd, opts);
      }
      return Promise.resolve({ code: 1, stdout: '', stderr: `invented: unexpected ${cmd.join(' ')}` });
    }
    facts.onView?.();
    const answer = facts.views?.[`${(cmd[5] ?? '').replace('zgeoff/', '')}#${cmd[3] ?? ''}`];
    const viewed = answer === undefined ? { code: 1, stdout: '', stderr: 'invented: no such PR' } : { code: 0, stdout: answer, stderr: '' };
    return Promise.resolve(viewed);
  };
}
