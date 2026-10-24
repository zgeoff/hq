import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { RepoNames } from './rekey-specs.ts';
import type { ReviewMove } from './types.ts';

// The review files of repo `from` and where the re-key puts them: the files below the
// zgeoff/<repo> folder, and the flat <repo><pr>-review.md files from before that layout.
export function readReviewMoves(reviewDir: string, names: RepoNames): ReviewMove[] {
  return [...readNestedMoves(reviewDir, names), ...readFlatMoves(reviewDir, names)];
}

function readNestedMoves(reviewDir: string, names: RepoNames): ReviewMove[] {
  const fromDir = join(reviewDir, 'zgeoff', names.from.toLowerCase());
  const toDir = join(reviewDir, 'zgeoff', names.to.toLowerCase());
  if (!existsSync(fromDir) || !statSync(fromDir).isDirectory()) {
    return [];
  }
  return readdirSync(fromDir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => join(entry.parentPath, entry.name))
    .toSorted()
    .map((file) => readMove(file, join(toDir, relative(fromDir, file))));
}

function readMove(from: string, to: string): ReviewMove {
  return { from, to, collides: existsSync(to) };
}

function readFlatMoves(reviewDir: string, names: RepoNames): ReviewMove[] {
  if (!existsSync(reviewDir)) {
    return [];
  }
  const shape = new RegExp(`^${RegExp.escape(names.from.toLowerCase())}(?<pr>\\d+)-review\\.md$`, 'u');
  return readdirSync(reviewDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .flatMap((entry) => {
      const pr = shape.exec(entry.name)?.groups?.['pr'];
      return pr === undefined ? [] : [readMove(join(reviewDir, entry.name), join(reviewDir, `${names.to.toLowerCase()}${pr}-review.md`))];
    })
    .toSorted((first, second) => first.from.localeCompare(second.from));
}
