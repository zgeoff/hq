import type { RunResult, Runner } from '../src/runner/types.ts';

export interface StubFinalFacts {
  commits: string[] | 'fault';
  lookups?: Record<string, string>;
  lookupFault?: boolean;
}

export function buildStubFinalGH(facts: StubFinalFacts, calls: string[]): Runner {
  return (cmd) => {
    const line = cmd.join(' ');
    calls.push(line);
    return Promise.resolve(answer(facts, line));
  };
}

const BAD_GATEWAY: RunResult = { code: 1, stdout: '', stderr: 'gh: Bad Gateway (HTTP 502)' };
const NOT_FOUND: RunResult = { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };

function answer(facts: StubFinalFacts, line: string): RunResult {
  if (/ repos\/[\w.-]+\/[\w.-]+\/pulls\/\d+\/commits /u.test(line)) {
    return facts.commits === 'fault' ? BAD_GATEWAY : { code: 0, stdout: `${facts.commits.join('\n')}\n`, stderr: '' };
  }
  const lookup = /\/commits\/(?<sha>[0-9a-f]+) --jq \.sha$/u.exec(line);
  if (lookup === null) {
    return { code: 1, stdout: '', stderr: 'invented: unknown call' };
  }
  if (facts.lookupFault) {
    return BAD_GATEWAY;
  }
  const full = facts.lookups?.[lookup.groups?.['sha'] ?? ''];
  return full === undefined ? NOT_FOUND : { code: 0, stdout: `${full}\n`, stderr: '' };
}
