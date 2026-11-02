export interface MergedPR {
  ref: string;
  designPass: boolean;
}

export interface OwnerWait {
  waitsOnGeoff: boolean;
  waitsOn: string | null;
}

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

function isRefNamed(text: string, ref: string): boolean {
  const [repo = '', number = ''] = ref.split('#');
  const escaped = repo.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(`(?<![\\w.-])${escaped}(?:#|/pull/)${number}(?!\\d)`, 'u').test(text);
}
