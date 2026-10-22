import { parseLanes } from '../areas/parse-lanes.ts';
import type { LaneConfig } from '../areas/types.ts';

export interface Pacing {
  impMib: number;
  lanes: LaneConfig[] | null;
  error: string | null;
}

// pacing.json's imp size and lanes. A file hq can't read, or one with no lanes, gives one pool of
// imp slots. Lanes it refuses give an error, so the watcher nudges nothing on a config it can't read.
export async function loadPacing(path: string): Promise<Pacing> {
  const DEFAULT_IMP_MIB = 2048,
    file = await readPacingJSON(path),
    impMib = (file as { imp?: { impMib?: number } } | null)?.imp?.impMib ?? DEFAULT_IMP_MIB;
  if ((file as { lanes?: unknown } | null)?.lanes === undefined) {
    return { impMib, lanes: null, error: null };
  }
  try {
    return { impMib, lanes: parseLanes(file), error: null };
  } catch (error) {
    return { impMib, lanes: null, error: `pacing.json: ${(error as Error).message}` };
  }
}

async function readPacingJSON(path: string): Promise<unknown> {
  try {
    return (await Bun.file(path).json()) as unknown;
  } catch {
    return null;
  }
}
