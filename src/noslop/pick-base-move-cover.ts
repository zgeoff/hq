// One ok noslop review of the PR as noslop_rounds stores it, oldest first.
export interface CoverRow {
  head: string | null;
  base: string | null;
  confirm: number;
  base_move: number;
  patch_id: string | null;
}

export type StoredCover = { stored: true; reviewBase: string; patchId: string } | { stored: false; why: string };

// What hq recorded says noslop's review at the summary head covers the PR head: the newest ok run at
// the PR head was a base move, and its diff's patch-id is the one of the full review at the summary
// head. The gate still recomputes both patch-ids from git before it trusts this.
export function pickBaseMoveCover(rows: readonly CoverRow[], summaryHead: string, head: string): StoredCover {
  const atHead = rows.findLast((row) => row.head === head);
  if (atHead?.base_move !== 1) {
    return { stored: false, why: `hq has no base-move run recorded at ${head.slice(0, 7)}` };
  }
  const reviewed = rows.findLast((row) => row.head === summaryHead && row.confirm === 0);
  if (reviewed === undefined || reviewed.base === null || !reviewed.patch_id) {
    return { stored: false, why: `hq has no full review with a patch-id recorded at ${summaryHead.slice(0, 7)}` };
  }
  if (atHead.patch_id !== reviewed.patch_id) {
    return { stored: false, why: `the diff recorded at ${head.slice(0, 7)} is not the one reviewed at ${summaryHead.slice(0, 7)}` };
  }
  return { stored: true, reviewBase: reviewed.base, patchId: reviewed.patch_id };
}
