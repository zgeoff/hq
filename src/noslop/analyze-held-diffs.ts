import { compareLineChange } from './compare-line-change.ts';
import { parseFileDiff } from './parse-file-diff.ts';
import type { HeldDiff, MoveClaim } from './types.ts';

export type HeldAnalysis = { ok: true; claims: MoveClaim[]; lines: number } | { ok: false; reason: string };

// Whether every held file's diff is a run of one-line replacements that differ only in a way a
// line may differ mechanically. It names the first file and line that is not. The targets that
// moved come back as claims to prove against git.
export function analyzeHeldDiffs(files: HeldDiff[]): HeldAnalysis {
  const claims: MoveClaim[] = [];
  let lines = 0;
  for (const file of files) {
    const parsed = parseFileDiff(file.diff);
    if ('refused' in parsed) {
      return { ok: false, reason: `${file.path}: ${parsed.refused}` };
    }
    for (const hunk of parsed.hunks) {
      if (hunk.removed.length !== hunk.added.length) {
        return { ok: false, reason: `${file.path} line ${hunk.start}: a line was added or removed` };
      }
      for (const [index, removed] of hunk.removed.entries()) {
        const line = hunk.start + index;
        const change = compareLineChange(file.path, removed, hunk.added[index] ?? '');
        if (!change.ok) {
          return { ok: false, reason: `${file.path} line ${line}: ${change.reason}` };
        }
        claims.push(...change.moves.map((candidates) => ({ path: file.path, line, candidates })));
        lines += 1;
      }
    }
  }
  return { ok: true, claims, lines };
}
