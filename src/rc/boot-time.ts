import { readFileSync } from 'node:fs';

export function bootTime(proc = '/proc'): number | null {
  try {
    const m = /^btime (\d+)$/m.exec(readFileSync(`${proc}/stat`, 'utf8'));
    return m ? Number(m[1]) * 1000 : null;
  } catch {
    return null;
  }
}
