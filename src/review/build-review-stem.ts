// GitHub names hold "-", "." and digits but never "/", so no two PRs share a stem. Lowercase, since
// GitHub names ignore case.
export function buildReviewStem(owner: string, repo: string, pr: number): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}/${pr}`;
}
