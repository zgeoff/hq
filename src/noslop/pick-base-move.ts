export interface BaseMove {
  reviewed: string;
  head: string;
  patchId: string;
}

export interface LastFullReview {
  head: string | null;
  patch_id: string | null;
}

export interface PRRefs {
  headRefOid: string;
  baseRefName: string;
}

export interface ComparedReview {
  head: string;
  patchId: string;
}

export function pickComparedReview(last: LastFullReview | null, refs: PRRefs | null): ComparedReview | null {
  if (last === null || last.head === null || last.patch_id === null || last.patch_id === '' || refs === null || refs.headRefOid === last.head) {
    return null;
  }
  return { head: last.head, patchId: last.patch_id };
}

export function pickBaseMove(compared: ComparedReview, refs: PRRefs, patchID: string | null): BaseMove | null {
  if (patchID === null || patchID !== compared.patchId) {
    return null;
  }
  return { reviewed: compared.head, head: refs.headRefOid, patchId: patchID };
}
