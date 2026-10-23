import { analyzeHeldDiffs } from './analyze-held-diffs.ts';
import { isMovedTarget } from './is-moved-target.ts';
import type { HeldDiff, MechanicalProof, MoveFacts } from './types.ts';

// Whether the held files' diffs are mechanical edits, proved from the diffs and git's facts about
// the moved targets alone. No word from a reviewer enters it.
export function proveMechanical(files: HeldDiff[], facts: MoveFacts): MechanicalProof {
  const analysis = analyzeHeldDiffs(files);
  if (!analysis.ok) {
    return { pass: false, reason: analysis.reason };
  }
  const unproved = analysis.claims.find((claim) => !isMovedTarget(claim, facts));
  if (unproved !== undefined) {
    const [from, to] = unproved.candidates[0] ?? ['?', '?'];
    return { pass: false, reason: `${unproved.path} line ${unproved.line}: ${from} to ${to} is not proved to be the same file moved` };
  }
  return { pass: true, files: files.filter((file) => file.diff.trim() !== '').map((file) => file.path), lines: analysis.lines };
}
