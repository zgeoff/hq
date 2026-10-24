import type { Focus } from './types.ts';

export function buildFocusKey(focus: Focus | null): string {
  return JSON.stringify(focus?.terms.map((term) => term.text) ?? []);
}
