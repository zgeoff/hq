import { HqError } from '../errors.ts';
import type { Rec } from './types.ts';

// The live branch ends at the last main-chain record in the file; the branch is its ancestors.
export function collectBranch(byUuid: Map<string, Rec>, recs: Rec[]): Rec[] {
  const last = [...recs].reverse().find((r) => !r.obj.isSidechain);
  if (!last) return [];
  const out: Rec[] = [];
  const seen = new Set<string>();
  for (let r: Rec | undefined = last; r; ) {
    if (seen.has(r.obj.uuid)) throw new HqError('bad_transcript', `the parentUuid chain loops at ${r.obj.uuid}`);
    seen.add(r.obj.uuid);
    out.push(r);
    const parent: string | null | undefined = r.obj.parentUuid;
    if (!parent) break;
    r = byUuid.get(parent);
    if (!r) throw new HqError('bad_transcript', `record ${out.at(-1)!.obj.uuid} on the live branch names a parent ${parent} that is not in the transcript`);
  }
  return out.reverse();
}
