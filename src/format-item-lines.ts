import type { ItemExtras } from './parse-item-input.ts';

export function formatItemLines(stuView: string | null, extras: ItemExtras | null): string[] {
  const options = (extras?.options ?? []).map((option, index) => `  ${index + 1}. ${option.label}: ${option.effect}${option.recommended === true ? " (Stu's pick)" : ''}`);
  const view = stuView === null ? [] : [`  stu's view: ${stuView}`];
  return [...view, ...options];
}
