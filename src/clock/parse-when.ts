import { z } from 'zod';
import { HqError } from '../errors.ts';

const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 };
const UnitSchema = z.enum(['m', 'h', 'd']);

export function parseWhen(raw: string, from: Date): Date {
  const rel = /^\+(\d+)([mhd])$/.exec(raw);
  if (rel) {
    const n = Number(rel[1]);
    return new Date(from.getTime() + n * UNIT_MS[UnitSchema.parse(rel[2])]);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new HqError('bad_args', `cannot read a time from "${raw}" (use ISO or +4h)`);
  return d;
}
