import type { ItemOption } from '../parse-item-input.ts';
import type { PickedOption } from './types.ts';

export function parsePickedOption(answer: string, options: readonly ItemOption[]): PickedOption {
  const match = options.find((option) => answer === option.label) ?? findLongestPrefix(answer, options);
  if (match === undefined) {
    return { picked: null, stuPick: null, words: answer };
  }
  const note = answer === match.label ? '' : answer.slice(match.label.length + ' | '.length);
  return { picked: match.label, stuPick: match.recommended === true, words: note === '' ? null : note };
}

function findLongestPrefix(answer: string, options: readonly ItemOption[]): ItemOption | undefined {
  return options.filter((option) => answer.startsWith(`${option.label} | `)).toSorted((left, right) => right.label.length - left.label.length)[0];
}
