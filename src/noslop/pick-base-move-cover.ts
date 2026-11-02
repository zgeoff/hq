export interface CoverRow {
  head: string | null;
  base: string | null;
  confirm: number;
  base_move: number;
  patch_id: string | null;
}

export type StoredCover = { stored: true; reviewBase: string; patchId: string } | { stored: false; why: string };

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
