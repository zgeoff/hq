import type { Runner } from '../src/runner/types.ts';

export interface StubGitHubFacts {
  views?: Record<string, string>;

  search?: string;

  merged?: string;

  calls?: string[];

  onView?: () => void;

  fallback?: Runner;
}

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
