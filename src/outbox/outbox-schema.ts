import { buildRowSchema } from '../db/build-row-schema.ts';

export const OutboxSchema = buildRowSchema('outbox');
