// A base move hq found: the head of the last full review, and the head and PR diff it compared.
export interface BaseMove {
  reviewed: string;
  head: string;
  patchId: string;
}

// The PR's last full review as noslop_rounds stores it.
export interface LastFullReview {
  head: string | null;
  patch_id: string | null;
}

// The PR's head and base branch as GitHub gives them now.
export interface PRRefs {
  headRefOid: string;
  baseRefName: string;
}

// The last full review's head and PR diff, which a new head is compared with.
export interface ComparedReview {
  head: string;
  patchId: string;
}

// The last full review to compare a new head with: one with a head and a readable PR diff, at
// another head than the PR holds. Null when there is nothing to compare, so the review is a round.
export function pickComparedReview(last: LastFullReview | null, refs: PRRefs | null): ComparedReview | null {
  if (last === null || last.head === null || last.patch_id === null || last.patch_id === '' || refs === null || refs.headRefOid === last.head) {
    return null;
  }
  return { head: last.head, patchId: last.patch_id };
}

// A base move when the new head's PR diff is the compared review's; null otherwise.
export function pickBaseMove(compared: ComparedReview, refs: PRRefs, patchID: string | null): BaseMove | null {
  if (patchID === null || patchID !== compared.patchId) {
    return null;
  }
  return { reviewed: compared.head, head: refs.headRefOid, patchId: patchID };
}
