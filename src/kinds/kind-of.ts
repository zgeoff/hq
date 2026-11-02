import type { Kind } from './kinds.ts';
import { KINDS } from './kinds.ts';

export function kindOf(title: string): Kind {
  const m = /^\s*([A-Za-z]+)(?:\([^)]*\))?!?:/.exec(title);
  const k = m?.[1]!.toLowerCase();
  return k && (KINDS as readonly string[]).includes(k) ? (k as Kind) : 'other';
}
