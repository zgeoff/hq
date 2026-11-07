import type { z } from 'zod';
import { parseStoredExtras } from '../parse-stored-extras.ts';
import type { AskRowSchema } from './ask-row-schema.ts';
import type { Ask } from './types.ts';

export function parseAskRow(row: z.output<typeof AskRowSchema> | null): Ask | null {
  return row ? { ...row, item: parseStoredExtras(row.item) } : null;
}
