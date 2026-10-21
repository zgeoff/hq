import { HqError } from '../errors.ts';

export function parseReadyTotal(raw: string): number {
  if (!/^\d{1,5}$/.test(raw.trim())) throw new HqError('bad_args', '--ready-total must be a whole number');
  return Number(raw);
}
