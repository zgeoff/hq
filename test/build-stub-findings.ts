import type { RunResult } from '../src/runner/types.ts';

export function buildStubFindings(state: string): RunResult {
  return { code: 0, stdout: JSON.stringify({ findings: [{ id: 'aaaa', path: 'kettle.ts', severity: 'high', state, author: 'zgeoff' }] }), stderr: '' };
}
