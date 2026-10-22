import type { RunResult } from './types.ts';

export function toRunFailure(error: unknown): RunResult {
  return { code: 1, stdout: '', stderr: String(error) };
}
