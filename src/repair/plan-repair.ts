import { collectBranch as branch } from './collect-branch.ts';
import { findSplit } from './find-split.ts';
import { parseTranscript as parse } from './parse-transcript.ts';
import type { Change, Rec, RepairPlan, Split } from './types.ts';

// Plans the repair over parsed records, changing parentUuids in place, one split at a time.
export function planRepair(text: string): RepairPlan & { recs: Rec[]; lineText: string[] } {
  const { lines, recs } = parse(text);
  const byUuid = new Map(recs.map((r) => [r.obj.uuid, r]));
  const splits: Split[] = [];
  const changes: Change[] = [];
  const offBranch = new Set<string>();
  const set = (uuid: string, to: string, why: string) => {
    const r = byUuid.get(uuid)!;
    changes.push({ line: r.line + 1, uuid, from: r.obj.parentUuid ?? null, to, why });
    r.obj.parentUuid = to;
  };
  for (let n = 0; n < 50; n++) {
    const path = branch(byUuid, recs);
    const s = findSplit(byUuid, recs, path, offBranch);
    if (!s) break;
    splits.push(s);
    const first = s.interlopers[0]!;
    const last = s.interlopers.at(-1)!;
    const after = path[path.findIndex((r) => r.obj.uuid === s.anchor) + 1]!;
    set(s.result, s.use, 'advisor result back on its use');
    set(first, s.anchor, "interloper moved after the turn's last record");
    set(after.obj.uuid, last, 'next record follows the moved interloper');
  }
  const path = branch(byUuid, recs);
  return { lines: lines.length, splits, offBranch: [...offBranch], changes, leaf: path.at(-1)?.obj.uuid ?? null, recs, lineText: lines };
}
