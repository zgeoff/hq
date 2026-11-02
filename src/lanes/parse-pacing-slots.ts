import { z } from 'zod';
import { parseLanes } from '../areas/parse-lanes.ts';
import { parseSlotCounts } from './parse-slot-counts.ts';
import type { PacingSlots } from './types.ts';

const fileSchema = z.object({ slots: z.unknown() }).partial();

export function parsePacingSlots(raw: unknown): PacingSlots {
  const file = fileSchema.safeParse(raw);
  const given = file.success ? file.data.slots : undefined;
  if (given !== undefined) {
    return parseSlotCounts(given);
  }
  const lanes = parseLanes(raw);
  return { imp: sumSize(lanes, 'imp'), local: sumSize(lanes, 'local') };
}

function sumSize(lanes: ReturnType<typeof parseLanes>, place: 'imp' | 'local'): number {
  return lanes.filter((lane) => lane.place === place).reduce((sum, lane) => sum + lane.size, 0);
}
