import { isKind } from './is-kind.ts';
import type { Kind } from './kinds.ts';

export function kindOf(title: string): Kind {
  const m = /^\s*([A-Za-z]+)(?:\([^)]*\))?!?:/.exec(title);
  const k = m?.[1]!.toLowerCase();
  return k && isKind(k) ? k : 'other';
}
