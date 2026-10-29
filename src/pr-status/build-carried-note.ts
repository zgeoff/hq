import type { OwnerWords } from './read-pr-answers.ts';

export function buildCarriedNote(words: OwnerWords, patchID: string): string {
  const said = words.note === null ? words.source : `${words.source}: ${words.note}`;
  return `from ${said}; patch-id ${patchID}`;
}
