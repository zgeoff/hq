// A GitHub repo name holds letters, digits, ".", "-" and "_" but never "+", so the stem splits one
// way only.
export function buildRoundStem(repo: string, pr: number): string {
  return `${repo}+${pr}`;
}
