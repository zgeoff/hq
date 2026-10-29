import { pickPhraseTarget } from './pick-phrase-target.ts';
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
  const target = pickPhraseTarget(phrase.mentioned, phrase.refs);
  return target === null ? [] : [{ ref: target, sha: phrase.sha }];
}
