import { isRecord } from '@zgeoff/std';

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return isRecord(e) && e['code'] === 'EPERM';
  }
}
