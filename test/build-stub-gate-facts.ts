import type { RunResult } from '../src/runner/types.ts';

interface StubGateFacts {
  head: string;
  checks: unknown[];
}

export function buildStubGateFacts(facts: StubGateFacts): RunResult {
  return { code: 0, stdout: JSON.stringify({ headRefOid: facts.head, baseRefName: 'main', author: { login: 'zgeoff', is_bot: false }, statusCheckRollup: facts.checks }), stderr: '' };
}
