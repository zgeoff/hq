import { readFileSync, readdirSync } from 'node:fs';
import { pidFromCmdlines } from './pid-from-cmdlines.ts';
import type { PidFind } from './types.ts';
import { toErrorMessage } from '../to-error-message.ts';

export function scanProc(sessionId: string, proc = '/proc'): PidFind {
  const procs: { pid: number; args: string[] }[] = [];
  let names: string[];
  try {
    names = readdirSync(proc);
  } catch (e) {
    return { why: `can't read ${proc}: ${toErrorMessage(e).slice(0, 100)}` };
  }
  for (const n of names) {
    if (!/^\d+$/.test(n)) continue;
    try {
      procs.push({ pid: Number(n), args: readFileSync(`${proc}/${n}/cmdline`, 'utf8').split('\0') });
    } catch {} // gone, or not ours to read
  }
  return pidFromCmdlines(sessionId, procs);
}
