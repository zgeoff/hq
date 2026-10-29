import type { IssueRefs } from './types.ts';

// A note that names any PR outside this row is ambiguous: mark nothing. When the note names PRs,
// exactly one of them must be this row's open PR. Only a note that names none falls back to the only
// open PR, a design pass's PR left out, since a build agent speaks of its own.
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
