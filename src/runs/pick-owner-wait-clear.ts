export interface MergedPR {
  ref: string;
  designPass: boolean;
}

export interface OwnerWait {
  waitsOnGeoff: boolean;
  waitsOn: string | null;
}

// Which rule clears an owner wait when a PR of the run merges: 'named' when the wait text names that
// PR, 'last-open' when no open PR is left on the run, null when the wait holds. An open PR the merge
// leaves behind keeps a wait that does not name the merged one.
export function pickOwnerWaitClear(wait: OwnerWait, merged: MergedPR, openLeft: number): 'named' | 'last-open' | null {
  if (!wait.waitsOnGeoff) {
    return null;
  }
  if (wait.waitsOn !== null && isRefNamed(wait.waitsOn, merged.ref)) {
    return 'named';
  }

  // A design pass's merge leaves the build to come, so only a code PR's merge ends the run's work.
  return openLeft === 0 && !merged.designPass ? 'last-open' : null;
}

// The text names repo#n either as written or as its GitHub URL (…/repo/pull/n). repo#4 does not name
// repo#41, and a repo name inside a longer one (mykettle#4) does not count.
function isRefNamed(text: string, ref: string): boolean {
  const [repo = '', number = ''] = ref.split('#');
  const escaped = repo.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(`(?<![\\w.-])${escaped}(?:#|/pull/)${number}(?!\\d)`, 'u').test(text);
}
