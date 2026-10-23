import { analyzeHeldDiffs } from './analyze-held-diffs.ts';
import type { HeldDiff } from './types.ts';

// The old and new path of every moved target the diffs claim; none when a diff is already refused,
// since git then has nothing to prove.
export function collectMovePaths(files: HeldDiff[]): [string, string][] {
  const analysis = analyzeHeldDiffs(files);
  return analysis.ok ? analysis.claims.flatMap((claim) => claim.candidates) : [];
}
