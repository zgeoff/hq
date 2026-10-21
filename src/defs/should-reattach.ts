export interface ReattachFacts {
  onBranch: boolean;
  hasOriginMain: boolean;
  clean: boolean;
  headOnOriginMain: boolean;
  hasLocalMain: boolean;
  localMainOnOriginMain: boolean;
}

export function shouldReattach(facts: ReattachFacts): boolean {
  if (facts.onBranch || !facts.hasOriginMain) {
    return false;
  }
  if (!facts.clean || !facts.headOnOriginMain) {
    return false;
  }
  return !facts.hasLocalMain || facts.localMainOnOriginMain;
}
