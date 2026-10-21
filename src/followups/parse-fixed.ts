import { HqError } from '../errors.ts';

export function parseFixed(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw.trim());
  if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(n) || n > 10_000) throw new HqError('bad_args', '--fixed must be a whole number, 0 to 10000');
  return n;
}
