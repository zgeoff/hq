import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { RepoNames } from './rekey-specs.ts';
import type { ReviewMove } from './types.ts';

// The review files below the zgeoff/<repo> folder of repo `from`, and where the re-key puts them.
// Flat <repo><pr>-review.md files from before that layout stay put: nothing reads them, and their
// names cannot show which repo they belong to.
export function readReviewMoves(reviewDir: string, names: RepoNames): ReviewMove[] {
  const fromDir = join(reviewDir, 'zgeoff', names.from.toLowerCase());
  const toDir = join(reviewDir, 'zgeoff', names.to.toLowerCase());
  if (!existsSync(fromDir) || !statSync(fromDir).isDirectory()) {
    return [];
  }
  return readdirSync(fromDir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
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
