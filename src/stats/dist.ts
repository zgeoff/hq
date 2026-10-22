import { THIN } from './thin.ts';
import type { Dist } from './types.ts';

export function dist(minutes: number[]): Dist {
  const xs = minutes.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  const at = (q: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.ceil(q * xs.length) - 1)]! : null);
  return { n: xs.length, medianMin: at(0.5), p90Min: at(0.9), thin: xs.length < THIN };
}
