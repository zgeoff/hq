import type { IssueRefs } from './types.ts';

export function pickPhraseTarget(mentioned: readonly string[], refs: IssueRefs): string | null {
  if (mentioned.some((ref) => !refs.all.has(ref))) {
    return null;
  }
  if (mentioned.length > 0) {
    const named = mentioned.filter((ref) => refs.open.has(ref));
    return named.length === 1 ? (named[0] ?? null) : null;
  }
  return refs.deliveryOpen.length === 1 ? (refs.deliveryOpen[0] ?? null) : null;
}
