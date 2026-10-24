import type { Focus } from './types.ts';

// What a Backlog count depends on: the terms' texts in order. Reserves only share out slots, so a
// reserve change keeps a count; no focus and a focus with no terms both count everything.
export function buildFocusKey(focus: Focus | null): string {
  return JSON.stringify(focus?.terms.map((term) => term.text) ?? []);
}
