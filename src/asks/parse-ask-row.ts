import type { z } from 'zod';
import { parseStoredExtras } from '../parse-stored-extras.ts';
import type { AskRowSchema } from './ask-row-schema.ts';
import type { Ask } from './types.ts';

export function parseAskRow(r: z.output<typeof AskRowSchema> | null): Ask | null {
  return r ? { ...r, item: parseStoredExtras(r.item) } : null;
}
