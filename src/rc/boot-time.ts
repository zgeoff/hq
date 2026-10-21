import { readFileSync } from 'node:fs';

// When this machine booted (btime in /proc/stat), in ms; null when unreadable.
export function bootTime(proc = '/proc'): number | null {
  try {
    const m = /^btime (\d+)$/m.exec(readFileSync(`${proc}/stat`, 'utf8'));
    return m ? Number(m[1]) * 1000 : null;
  } catch {
    return null;
  }
}
