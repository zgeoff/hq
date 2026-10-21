import type { ItemOption } from '../parse-item-input.ts';
import type { PickedOption } from './types.ts';

// The console stores an answer as `<label>`, `<label> | <note>`, or the note alone. An answer typed
// at the terminal ("agree (option 1)") matches no label, so it picks nothing and is all words.
export function parsePickedOption(answer: string, options: readonly ItemOption[]): PickedOption {
  const match = options.find((o) => answer === o.label || answer.startsWith(`${o.label} | `)),
    note = match === undefined ? '' : answer.slice(match.label.length + ' | '.length);
  if (match === undefined) {
    return { picked: null, stuPick: null, words: answer };
  }
  return { picked: match.label, stuPick: match.recommended === true, words: note === '' ? null : note };
}
