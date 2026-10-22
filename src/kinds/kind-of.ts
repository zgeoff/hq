import type { Kind } from './kinds.ts';
import { KINDS } from './kinds.ts';

// "fix(geo-902): ...", "feat!: ...", "Fix: ..." → fix, feat, fix. An area prefix such as hq's
// "runs: ..." or no prefix is other.
export function kindOf(title: string): Kind {
  const m = /^\s*([A-Za-z]+)(?:\([^)]*\))?!?:/.exec(title);
  const k = m?.[1]!.toLowerCase();
  return k && (KINDS as readonly string[]).includes(k) ? (k as Kind) : 'other';
}
