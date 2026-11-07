import { buildRowSchema } from '../db/build-row-schema.ts';

export const NudgeRowSchema = buildRowSchema('lanes_nudges').pick({ id: true, at: true, slots: true, free_minutes: true, eligible: true, slots_after: true, checked_at: true });
