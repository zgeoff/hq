import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { RepoNames } from './rekey-specs.ts';
import type { ReviewMove } from './types.ts';

export function readReviewMoves(reviewDir: string, names: RepoNames): ReviewMove[] {
  const fromDir = join(reviewDir, 'zgeoff', names.from.toLowerCase());
  const toDir = join(reviewDir, 'zgeoff', names.to.toLowerCase());
  if (!existsSync(fromDir) || !statSync(fromDir).isDirectory()) {
    return [];
  }

  // A review holds its flock on the file at its path, so moving a held lock file would let the next
  // review lock a new file at the old path while the first still runs.
  return readdirSync(fromDir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && !entry.name.endsWith('.flock'))
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted()
    .map((file) => readMove(reviewDir, file, join(toDir, relative(fromDir, file))));
}

// A file where a folder of the destination's path belongs blocks the move as surely as a file at
// the destination does.
function readMove(reviewDir: string, from: string, to: string): ReviewMove {
  return { from, to, collides: existsSync(to) || probeBlockedFolder(reviewDir, dirname(to)) };
}

function probeBlockedFolder(reviewDir: string, folder: string): boolean {
  if (existsSync(folder) && !statSync(folder).isDirectory()) {
    return true;
  }
  return folder !== join(reviewDir) && folder !== dirname(folder) && probeBlockedFolder(reviewDir, dirname(folder));
}
