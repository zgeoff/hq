import { buildRowSchema } from '../db/build-row-schema.ts';

export const RefusalRowSchema = buildRowSchema('refusals').omit({ scanned_at: true });
