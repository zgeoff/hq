import { z } from 'zod';
import { HqError } from '../errors.ts';
import { DEFAULT_DESIGN_SLOTS } from './default-design-slots.ts';
import type { DesignSlots } from './types.ts';

const MAX_SLOTS = 100;

const countSchema = z.number().int().min(0).max(MAX_SLOTS);

const fileSchema = z.object({ designSlots: countSchema.optional(), agentDesignSlots: countSchema.optional() });

export function parseDesignSlots(raw: unknown): DesignSlots {
  const parsed = fileSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new HqError('no_lanes', `pacing.json designSlots and agentDesignSlots: give each a whole number from 0 to ${MAX_SLOTS}`);
  }
  return { agent: parsed.data.agentDesignSlots ?? DEFAULT_DESIGN_SLOTS.agent, withGeoff: parsed.data.designSlots ?? DEFAULT_DESIGN_SLOTS.withGeoff };
}
