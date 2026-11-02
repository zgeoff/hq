// Which rule clears an owner wait when a PR of the run merges: 'named' when the wait text names that
// PR, 'last-open' when no open PR is left on the run, null when the wait holds. An open PR the merge
// leaves behind keeps a wait that does not name the merged one.
export function pickOwnerWaitClear(run: { waitsOnGeoff: boolean; waitsOn: string | null }, mergedRef: string, openLeft: number): 'named' | 'last-open' | null {
  if (!run.waitsOnGeoff) {
    return null;
  }
  if (run.waitsOn !== null && namesRef(run.waitsOn, mergedRef)) {
    return 'named';
  }
  return openLeft === 0 ? 'last-open' : null;
}

// repo#4 does not name repo#41, and a repo name inside a longer one (mykettle#4) does not count.
function namesRef(text: string, ref: string): boolean {
  const escaped = ref.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(`(?<![\\w.-])${escaped}(?!\\d)`, 'u').test(text);
}
