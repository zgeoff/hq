import { z } from 'zod';
import { parseLanes } from '../areas/parse-lanes.ts';
import type { LaneConfig } from '../areas/types.ts';
import { parsePacingSlots } from './parse-pacing-slots.ts';
import type { PacingSlots } from './types.ts';

export interface Pacing {
  impMib: number;
  lanes: LaneConfig[] | null;
  slots: PacingSlots | null;
  error: string | null;
}

const fileSchema = z.object({ lanes: z.unknown(), slots: z.unknown() }).partial();

const impSchema = z.object({ imp: z.object({ impMib: z.number() }) });

// pacing.json's imp size, lanes and slot caps. A file hq can't read, or one with neither lanes nor
// slots, gives one pool of imp slots. Lanes or slots it refuses give an error, so the watcher nudges
// nothing on a config it can't read.
export async function loadPacing(path: string): Promise<Pacing> {
  const DEFAULT_IMP_MIB = 2048;
  const file = await readPacingJSON(path);
  const parsed = fileSchema.safeParse(file);
  const shape = parsed.success ? parsed.data : {};
  const imp = impSchema.safeParse(file);
  const impMib = imp.success ? imp.data.imp.impMib : DEFAULT_IMP_MIB;
  if (shape.lanes === undefined && shape.slots === undefined) {
    return { impMib, lanes: null, slots: null, error: null };
  }
  try {
    return { impMib, lanes: parseLanes(file), slots: parsePacingSlots(file), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { impMib, lanes: null, slots: null, error: `pacing.json: ${message}` };
  }
}

async function readPacingJSON(path: string): Promise<unknown> {
  try {
    const raw: unknown = await Bun.file(path).json();
    return raw;
  } catch {
    return null;
  }
}
