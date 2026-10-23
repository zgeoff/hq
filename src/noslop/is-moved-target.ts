import { buildRenameKey } from './build-rename-key.ts';
import type { MoveClaim, MoveFacts } from './types.ts';

const REGULAR_FILE = /^100(?:644|755) blob [0-9a-f]+$/u;

// Whether git shows a claimed target moved: the same regular file, mode and content, now at the new
// path, with the old path gone. Both paths existing is not enough, and a symlink or a directory
// with the same object is not the same file.
export function isMovedTarget(claim: MoveClaim, facts: MoveFacts): boolean {
  return claim.candidates.some(([from, to]) => {
    const fromBase = facts.baseBlobs.get(from) ?? null;
    const toBase = facts.baseBlobs.get(to) ?? null;
    const toHead = facts.headBlobs.get(to) ?? null;
    if (toHead === null || !REGULAR_FILE.test(toHead) || (facts.headBlobs.get(from) ?? null) !== null) {
      return false;
    }
    if (fromBase !== null) {
      return fromBase === toHead;
    }
    return facts.renames.has(buildRenameKey(from, to)) && toBase === toHead;
  });
}
