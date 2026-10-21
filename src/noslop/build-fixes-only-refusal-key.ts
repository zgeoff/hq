// The meta key that holds noslop's last refusal of a --fixes-only run on the PR.
export function buildFixesOnlyRefusalKey(repo: string, pr: number): string {
  return `noslop_fixes_only_refused:${repo}#${pr}`;
}
