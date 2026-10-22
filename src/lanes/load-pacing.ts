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

// pacing.json's imp size, lanes and slot caps. A file hq can't read, or one with neither lanes nor
// slots, gives one pool of imp slots. Lanes or slots it refuses give an error, so the watcher nudges
// nothing on a config it can't read.
export async function loadPacing(path: string): Promise<Pacing> {
  const DEFAULT_IMP_MIB = 2048,
    file = await readPacingJSON(path),
    impMib = (file as { imp?: { impMib?: number } } | null)?.imp?.impMib ?? DEFAULT_IMP_MIB;
  if ((file as { lanes?: unknown } | null)?.lanes === undefined && (file as { slots?: unknown } | null)?.slots === undefined) {
    return { impMib, lanes: null, slots: null, error: null };
  }
  try {
    return { impMib, lanes: parseLanes(file), slots: parsePacingSlots(file), error: null };
  } catch (error) {
    return { impMib, lanes: null, slots: null, error: `pacing.json: ${(error as Error).message}` };
  }
}

async function readPacingJSON(path: string): Promise<unknown> {
  try {
    return (await Bun.file(path).json()) as unknown;
  } catch {
    return null;
  }
}
