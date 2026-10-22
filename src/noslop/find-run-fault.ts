import { TIMED_OUT } from '../runner/timed-out.ts';

// What a finished noslop run was before its output is read: a clean exit, or the reason it was not one.
export function findRunFault(code: number, stderr: string, timeoutMs: number): string | null {
  if (code === TIMED_OUT) {
    return `timed out after ${Math.round(timeoutMs / 60_000)} min`;
  }
  if (code !== 0) {
    return `exit ${code}: ${stderr}`;
  }
  return null;
}
