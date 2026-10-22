import { HqError } from '../errors.ts';

// "14d", "14" or 14: whole days.
export function parseDays(v: string | undefined, flag: string, dflt: number): number {
  if (v === undefined) return dflt;
  const m = /^(\d+)d?$/.exec(v);
  if (!m || Number(m[1]) < 1) throw new HqError('bad_args', `--${flag} must be a whole number of days, such as 14d`);
  return Number(m[1]);
}
