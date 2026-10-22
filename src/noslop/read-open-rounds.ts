import { readdirSync, statSync } from 'node:fs';
import { iso } from '../clock/iso.ts';
import { pidAlive } from '../rc/pid-alive.ts';

export interface OpenRound {
  ref: string;
  pid: number;
  startedAt: string;
}

const WORKTREE_SHAPE = /^(?<repo>.*\D)(?<pr>\d+)-noslop-(?<pid>\d+)$/u;

// hq writes a round's row only when it ends, so an open round shows as the throwaway worktree its
// review runs in (`<repo><pr>-noslop-<pid>` in the review folder) whose process is alive.
export function readOpenRounds(dir: string): OpenRound[] {
  return readNames(dir)
    .map((name) => ({ name, match: WORKTREE_SHAPE.exec(name) }))
    .filter((found) => found.match !== null)
    .map((found) => ({ name: found.name, repo: found.match?.groups?.['repo'] ?? '', pr: found.match?.groups?.['pr'] ?? '', pid: Number(found.match?.groups?.['pid']) }))
    .filter((found) => found.pid !== process.pid && pidAlive(found.pid))
    .flatMap((found) => {
      const startedAt = readStartedAt(`${dir}/${found.name}`);
      return startedAt === null ? [] : [{ ref: `${found.repo}#${found.pr}`, pid: found.pid, startedAt }];
    });
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
