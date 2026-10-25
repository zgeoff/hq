import type { SimResult } from './types.ts';

export function findSafeCap(upper: number, simulate: (lanes: number) => SimResult): { lanes: number; endsAt: string } | null {
  for (let lanes = upper; lanes >= 0; lanes -= 1) {
    const result = simulate(lanes);
    if (result.pause === null) {
      return { lanes, endsAt: result.endsAt };
    }
  }
  return null;
}
