export interface ListedCommit {
  sha: string;
  parents: string[];
}

export interface RebasedHeadChoice {
  // The last lens-reviewed head, which the rebased branch no longer holds.
  reviewedHead: string;

  // The reviewed commits past the base and the branch commits past it, oldest first.
  reviewed: readonly ListedCommit[];
  branch: readonly ListedCommit[];

  // Each commit's patch id by its sha; a commit with no patch has none.
  patchIDs: ReadonlyMap<string, string>;
}

// mapped: the branch commit that stands for the reviewed head; refused: why none does.
export type RebasedHead = { kind: 'mapped'; head: string } | { kind: 'refused'; why: string };

// The branch commit that stands for a reviewed head, by git's patch id as noslop maps it: the
// reviewed commits past the base must open the branch in the same order, each with an equal patch
// id, and an empty one with an empty one. A merge, a changed patch or a dropped commit maps to none.
export function pickRebasedHead(choice: RebasedHeadChoice): RebasedHead {
  const merge = [...choice.reviewed, ...choice.branch.slice(0, choice.reviewed.length)].find((commit) => commit.parents.length > 1);
  if (choice.reviewed.length === 0) {
    return buildRefusal(`the reviewed head ${toShort(choice.reviewedHead)} holds no commit past the base`);
  }
  if (merge !== undefined) {
    return buildRefusal(`the merge ${toShort(merge.sha)} needs a full review`);
  }
  if (choice.branch.length < choice.reviewed.length) {
    return buildRefusal(`the branch holds ${choice.branch.length} of the ${choice.reviewed.length} reviewed commits past the base`);
  }
  return pickPairedHead(choice);
}

function pickPairedHead(choice: RebasedHeadChoice): RebasedHead {
  const changedAt = choice.reviewed.findIndex((commit, index) => choice.patchIDs.get(commit.sha) !== choice.patchIDs.get(choice.branch[index]?.sha ?? '')),
    last = choice.branch[choice.reviewed.length - 1];
  if (changedAt !== -1) {
    return pickChangeRefusal(choice, changedAt);
  }
  return last === undefined ? buildRefusal('the branch holds no commit to map onto') : { kind: 'mapped', head: last.sha };
}

// A branch commit that holds another reviewed commit's patch shows a dropped or reordered commit;
// else the reviewed commit's patch changed or went with it.
function pickChangeRefusal(choice: RebasedHeadChoice, changedAt: number): RebasedHead {
  const changed = toShort(choice.reviewed[changedAt]?.sha ?? '');
  return hasMovedPatch(choice, changedAt) ? buildRefusal(`the branch drops or reorders the reviewed commit ${changed}, so the order does not match`) : buildRefusal(`the rebase changed the patch of the reviewed commit ${changed}, or dropped it`);
}

function hasMovedPatch(choice: RebasedHeadChoice, changedAt: number): boolean {
  const seen = choice.patchIDs.get(choice.branch[changedAt]?.sha ?? '');
  return choice.reviewed.some((commit, index) => index !== changedAt && choice.patchIDs.get(commit.sha) === seen);
}

function buildRefusal(why: string): RebasedHead {
  return { kind: 'refused', why };
}

function toShort(sha: string): string {
  return sha.slice(0, 7);
}
