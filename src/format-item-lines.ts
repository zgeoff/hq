import type { ItemExtras } from './parse-item-input.ts';

export function formatItemLines(stuView: string | null, extras: ItemExtras | null): string[] {
  const options = (extras?.options ?? []).map((o, i) => `  ${i + 1}. ${o.label}: ${o.effect}${o.recommended === true ? " (Stu's pick)" : ''}`),
    view = stuView === null ? [] : [`  stu's view: ${stuView}`];
  return [...view, ...options];
}
