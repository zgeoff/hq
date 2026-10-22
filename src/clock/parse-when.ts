import { HqError } from '../errors.ts';

// Accepts an ISO time, or +30m / +4h / +2d from now.
export function parseWhen(raw: string, from: Date): Date {
  const rel = /^\+(\d+)([mhd])$/.exec(raw);
  if (rel) {
    const n = Number(rel[1]);
    const ms = { m: 60_000, h: 3_600_000, d: 86_400_000 }[rel[2] as 'm' | 'h' | 'd'];
    return new Date(from.getTime() + n * ms);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new HqError('bad_args', `cannot read a time from "${raw}" (use ISO or +4h)`);
  return d;
}
