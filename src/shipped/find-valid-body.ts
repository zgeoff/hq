import type { z } from 'zod';

// A kept body read with its schema, or undefined when it is not JSON or does not fit, so the caller
// reads it again from its source.
export function findValidBody<S extends z.ZodType>(body: string, schema: S): z.output<S> | undefined {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return undefined;
  }
  const checked = schema.safeParse(value);
  return checked.success ? checked.data : undefined;
}
