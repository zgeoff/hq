// The stem of a PR's review files: "<repo><pr>" for a zgeoff repo, as it has always been, and
// "<owner>-<repo><pr>" for any other owner, so two owners' repos of one name never share a file.
// Lowercase, since GitHub names ignore case.
export function buildReviewStem(owner: string, repo: string, pr: number): string {
  const lower = repo.toLowerCase();
  return owner.toLowerCase() === 'zgeoff' ? `${lower}${pr}` : `${owner.toLowerCase()}-${lower}${pr}`;
}
