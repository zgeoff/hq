import { z } from 'zod';
import { parseLanes } from '../areas/parse-lanes.ts';
import type { LaneConfig } from '../areas/types.ts';
import { readPacingFile } from './read-pacing-file.ts';

const fileSchema = z.object({ lanes: z.unknown(), slots: z.unknown() }).partial();

// pacing.json's named lanes to check lanes.json against, or null when it gives only `slots`: the lane
// rules then stand on their own.
export async function readPacingLanes(): Promise<LaneConfig[] | null> {
  const raw = await readPacingFile();
  const file = fileSchema.safeParse(raw);
  if (file.success && file.data.lanes === undefined && file.data.slots !== undefined) {
    return null;
  }
  return parseLanes(raw);
}
