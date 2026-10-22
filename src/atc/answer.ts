import type { z } from 'zod';
import { HqError } from '../errors.ts';

export function answer<S extends z.ZodType>(method: string, value: unknown, schema: S): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const i = r.error.issues[0]!;
  const field = i.path.length ? i.path.join('.') : 'the answer';
  throw new HqError('bad_atc_answer', `atc ${method} answered with a bad ${field}: ${i.message}`, { method, field });
}
