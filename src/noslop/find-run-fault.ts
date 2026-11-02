import { TIMED_OUT } from '../runner/timed-out.ts';

export function findRunFault(code: number, stderr: string, timeoutMs: number): string | null {
  if (code === TIMED_OUT) {
    return `timed out after ${Math.round(timeoutMs / 60_000)} min`;
  }
  if (code !== 0) {
    return `exit ${code}: ${stderr}`;
  }
  return null;
}
