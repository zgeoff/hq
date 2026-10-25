import type { SimResult } from './types.ts';

// The highest lane count from 0 to `upper` whose run has no pause, or null when even 0 pauses.
export function findSafeCap(upper: number, simulate: (lanes: number) => SimResult): { lanes: number; endsAt: string } | null {
  for (let lanes = upper; lanes >= 0; lanes -= 1) {
    const result = simulate(lanes);
    if (result.pause === null) {
      return { lanes, endsAt: result.endsAt };
    }
  }
  return null;
}
