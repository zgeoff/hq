import { z } from 'zod';

// A column that stores JSON text. Text that is not JSON fails as a schema issue, so a bad row reads
// like any other bad row.
export function buildJSONColumn<Inner extends z.ZodType>(inner: Inner) {
  return z
    .string()
    .transform((text, ctx): unknown => {
      try {
        return JSON.parse(text);
      } catch (error) {
        ctx.issues.push({ code: 'custom', message: error instanceof Error ? error.message : 'not JSON', input: text });
        return z.NEVER;
      }
    })
    .pipe(inner);
}
