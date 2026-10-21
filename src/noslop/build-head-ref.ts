// The PR's head, fetched into a ref of hq's own: FETCH_HEAD is one file per clone, and any other
// fetch in the clone rewrites it, so a read of it can find another branch's tip.
export function buildHeadRef(pr: number): string {
  return `refs/hq/pr/${pr}`;
}
