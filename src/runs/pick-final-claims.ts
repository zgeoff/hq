import type { FinalClaim, FinalClaimFacts } from './types.ts';

export function pickFinalClaims(facts: FinalClaimFacts): FinalClaim[] {
  const mark = facts.mark;
  if (mark) {
    const ref = mark.ref;
    return ref === null || (mark.owner !== null && mark.owner !== facts.issue) ? [] : [{ ref, sha: mark.sha }];
  }
  const phrase = facts.phrase;
  if (!phrase) {
    return [];
  }
  const refs = phrase.mentioned.length > 0 ? phrase.mentioned.filter((ref) => facts.owned.some((pr) => pr.ref === ref)) : facts.owned.filter((pr) => pr.state === 'open').map((pr) => pr.ref);
  return refs.map((ref) => ({ ref, sha: phrase.sha }));
}
