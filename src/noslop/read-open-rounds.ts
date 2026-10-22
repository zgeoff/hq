import { readdirSync, statSync } from 'node:fs';
import { iso } from '../clock/iso.ts';
import { pidAlive } from '../rc/pid-alive.ts';

export interface OpenRound {
  ref: string;
  pid: number;
  startedAt: string;
}

// hq writes a round's row only when it ends, so an open round shows as the throwaway worktree its
// review runs in (`<repo>+<pr>-noslop-<pid>` in the review folder) whose process is alive. A round
// under the old name still counts, so a pin waits for it, but its ref names the stem, not a guess.
export function readOpenRounds(dir: string): OpenRound[] {
  return readNames(dir).flatMap((name) => {
    const found = parseWorktreeName(name);
    if (found === null || found.pid === process.pid || !pidAlive(found.pid)) {
      return [];
    }
    const startedAt = readStartedAt(`${dir}/${name}`);
    return startedAt === null ? [] : [{ ref: found.ref, pid: found.pid, startedAt }];
  });
}

const WORKTREE_SHAPE = /^(?<repo>[^+]+)\+(?<pr>\d+)-noslop-(?<pid>\d+)$/u;

// The name a worktree had before the stem held a "+": "kettle12" may be kettle1 #2 or kettle #12.
const OLD_WORKTREE_SHAPE = /^(?<stem>.*\D\d+)-noslop-(?<pid>\d+)$/u;

function parseWorktreeName(name: string): { ref: string; pid: number } | null {
  const current = WORKTREE_SHAPE.exec(name)?.groups;
  if (current !== undefined) {
    return { ref: `${current['repo']}#${current['pr']}`, pid: Number(current['pid']) };
  }
  const old = OLD_WORKTREE_SHAPE.exec(name)?.groups;
  return old === undefined ? null : { ref: `${old['stem']} (old worktree name)`, pid: Number(old['pid']) };
}

// A review removes its worktree as it ends, which can fall between the scan and this read.
function readStartedAt(path: string): string | null {
  try {
    return iso(statSync(path).mtime);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function readNames(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
