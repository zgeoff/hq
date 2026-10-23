import type { RunResult, Runner } from '../src/runner/types.ts';

// A runner that answers each command by its program, the first word, and fails a program it has no
// answer for with the exit code and message a shell gives for a missing program.
export function buildStubProgramRunner(answers: Record<string, RunResult>): Runner {
  return (command) => Promise.resolve(answers[command[0] ?? ''] ?? { code: 127, stdout: '', stderr: `${command[0] ?? ''}: command not found` });
}
