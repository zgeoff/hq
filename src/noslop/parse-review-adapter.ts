import { z } from 'zod';
import { HqError } from '../errors.ts';

const AdapterSchema = z.enum(['codex', 'claude']);

export type ReviewAdapter = z.output<typeof AdapterSchema>;

export function parseReviewAdapter(value: string | undefined): ReviewAdapter | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = AdapterSchema.safeParse(value);
  if (!parsed.success) {
    throw new HqError('bad_args', `--adapter must be codex or claude, not "${value.slice(0, 40)}"`);
  }
  return parsed.data;
}
