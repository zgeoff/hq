import type { z } from 'zod';

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
