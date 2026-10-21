import type { Size } from './bands.ts';
import { BANDS } from './bands.ts';
import { SIZES } from './sizes.ts';

export function bandOf(lines: number): Size {
  return SIZES.find((s) => lines >= BANDS[s][0] && lines < BANDS[s][1])!;
}
