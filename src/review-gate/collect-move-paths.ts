import { analyzeHeldDiffs } from './analyze-held-diffs.ts';
import type { HeldDiff } from './types.ts';

export function collectMovePaths(files: HeldDiff[]): [string, string][] {
  const analysis = analyzeHeldDiffs(files);
  return analysis.ok ? analysis.claims.flatMap((claim) => claim.candidates) : [];
}
