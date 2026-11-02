import type { RunResult, Runner } from '../src/runner/types.ts';

export function buildStubProgramRunner(answers: Record<string, RunResult>): Runner {
  return (command) => Promise.resolve(answers[command[0] ?? ''] ?? { code: 127, stdout: '', stderr: `${command[0] ?? ''}: command not found` });
}
