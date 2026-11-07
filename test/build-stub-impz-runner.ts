import type { Runner } from '../src/runner/types.ts';

export interface StubImpzAnswers {
  info: Record<string, unknown>;
  imps: readonly Record<string, unknown>[];
}

export function buildStubImpzRunner(answers: StubImpzAnswers): Runner {
  const stdout = new Map([
    ['info', JSON.stringify(answers.info)],
    ['ls', JSON.stringify(answers.imps)],
  ]);
  return (command) => {
    const answer = stdout.get(command[1] ?? '');
    const result = answer === undefined ? { code: 2, stdout: '', stderr: `impz: unknown command ${command.join(' ')}` } : { code: 0, stdout: answer, stderr: '' };
    return Promise.resolve(result);
  };
}
