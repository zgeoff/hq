import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { PacingSlots } from './types.ts';

const MAX_SLOTS = 100;

const countSchema = z.number().int().min(0).max(MAX_SLOTS);

const slotsSchema = z.strictObject({ imp: countSchema, local: countSchema });

// pacing.json's `slots: { imp, local }`: the slot caps by place, each a whole number from 0 to 100.
export function parseSlotCounts(raw: unknown): PacingSlots {
  const parsed = slotsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HqError('no_lanes', `pacing.json slots: give { imp: n, local: n }, each a whole number from 0 to ${MAX_SLOTS}`);
  }
  return parsed.data;
}
