import type { ItemExtras, ItemInput } from './parse-item-input.ts';

export function splitItemExtras(item: ItemInput): ItemExtras {
  const { title: _title, question: _question, stuView: _stuView, ...extras } = item;
  return extras;
}
