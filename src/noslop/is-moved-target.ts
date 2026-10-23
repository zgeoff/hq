import { buildRenameKey } from './build-rename-key.ts';
import type { MoveClaim, MoveFacts } from './mechanical-types.ts';

// Whether git shows a claimed target moved: the same file now at the new path, with the old path
// gone. Both paths existing is not enough.
export function isMovedTarget(claim: MoveClaim, facts: MoveFacts): boolean {
  return claim.candidates.some(([from, to]) => {
    const fromBase = facts.baseBlobs.get(from) ?? null;
    const toBase = facts.baseBlobs.get(to) ?? null;
    const toHead = facts.headBlobs.get(to) ?? null;
    if (toHead === null || (facts.headBlobs.get(from) ?? null) !== null) {
      return false;
    }
    if (fromBase !== null) {
      return fromBase === toHead;
    }
    return facts.renames.has(buildRenameKey(from, to)) && toBase === toHead;
  });
}
