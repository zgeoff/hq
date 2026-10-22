import { HqError } from '../errors.ts';
import { bandOf } from './band-of.ts';
import type { Size } from './bands.ts';
import { SIZES } from './sizes.ts';

// Both flags or neither; the line guess must sit inside its band.
export function parseSize(size: string | undefined, lines: string | undefined): { size: Size; lines: number } | null {
  if (size === undefined && lines === undefined) return null;
  if (size === undefined || lines === undefined) throw new HqError('bad_args', '--size and --lines go together, such as --size L --lines 3000');
  const s = size.toUpperCase() as Size;
  if (!SIZES.includes(s)) throw new HqError('bad_args', `--size must be ${SIZES.join(', ')}`);
  const n = Number(lines.replaceAll(',', ''));
  if (!Number.isInteger(n) || n <= 0) throw new HqError('bad_args', '--lines must be a whole number of lines, such as 3000');
  if (bandOf(n) !== s) throw new HqError('bad_args', `${n} lines is ${bandOf(n)}, not ${s} (S under 500, M 500 to 2,000, L 2,000 to 5,000, XL over 5,000)`);
  return { size: s, lines: n };
}
