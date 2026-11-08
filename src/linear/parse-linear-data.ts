import type { z } from 'zod';
import { HqError } from '../errors.ts';

export function parseLinearData<Schema extends z.ZodType>(data: unknown, schema: Schema): z.output<Schema> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    throw new HqError('linear_failed', `Linear answered an unexpected shape at ${issue?.path.join('.') || 'the top'}: ${issue?.message ?? 'invalid'}`);
  }
  return parsed.data;
}
