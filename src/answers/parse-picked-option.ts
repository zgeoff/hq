import type { ItemOption } from '../parse-item-input.ts';
import type { PickedOption } from './types.ts';

// The console stores an answer as `<label>`, `<label> | <note>`, or the note alone. An answer typed
// at the terminal ("agree (option 1)") matches no label, so it picks nothing and is all words.
export function parsePickedOption(answer: string, options: readonly ItemOption[]): PickedOption {
  const match = options.find((option) => answer === option.label) ?? findLongestPrefix(answer, options);
  if (match === undefined) {
    return { picked: null, stuPick: null, words: answer };
  }
  const note = answer === match.label ? '' : answer.slice(match.label.length + ' | '.length);
  return { picked: match.label, stuPick: match.recommended === true, words: note === '' ? null : note };
}

// A label may itself hold ` | `, so the longest label that leads the answer is the one picked.
function findLongestPrefix(answer: string, options: readonly ItemOption[]): ItemOption | undefined {
  return options.filter((option) => answer.startsWith(`${option.label} | `)).toSorted((left, right) => right.label.length - left.label.length)[0];
}
