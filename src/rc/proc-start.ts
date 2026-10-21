import { readFileSync } from 'node:fs';

// Field 22 of /proc/<pid>/stat, the process's start time, as Claude Code records it in procStart.
// The command name (field 2) may hold spaces or parentheses: count from the last ')'.
export function procStart(pid: number, proc = '/proc'): string | null {
  try {
    const stat = readFileSync(`${proc}/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null;
  } catch {
    return null;
  }
}
