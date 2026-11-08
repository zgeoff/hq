import { match } from 'ts-pattern';
import { z } from 'zod';
import { HqError } from '../errors.ts';

const UnitSchema = z.enum(['m', 'h', 'd']);

export function parseWhen(raw: string, from: Date): Date {
  const rel = /^\+(?<amount>\d+)(?<unit>[mhd])$/u.exec(raw);
  if (rel) {
    const amount = Number(rel.groups?.['amount']);
    return new Date(from.getTime() + amount * toUnitMs(UnitSchema.parse(rel.groups?.['unit'])));
  }
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) {
    throw new HqError('bad_args', `cannot read a time from "${raw}" (use ISO or +4h)`);
  }
  return at;
}

function toUnitMs(unit: z.output<typeof UnitSchema>): number {
  return match(unit)
    .with('m', () => 60_000)
    .with('h', () => 3_600_000)
    .with('d', () => 86_400_000)
    .exhaustive();
}
